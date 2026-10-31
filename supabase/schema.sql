create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null check (length(display_name) between 2 and 100),
  role text not null default 'student' check (role in ('student', 'admin')),
  created_at timestamptz not null default now(),
  constraint profiles_email_key unique (email)
);

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  position integer not null check (position > 0),
  prompt text not null,
  choices jsonb not null check (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) >= 2),
  correct_answer text not null,
  explanation text not null,
  unique (assessment_id, position),
  check (choices @> jsonb_build_array(correct_answer))
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete restrict,
  client_attempt_id uuid not null,
  answers jsonb not null,
  correct_count integer not null check (correct_count >= 0),
  question_count integer not null check (question_count > 0 and correct_count <= question_count),
  score integer not null check (score >= 0),
  max_score integer not null check (max_score > 0 and score <= max_score),
  created_at timestamptz not null default now(),
  unique (user_id, client_attempt_id),
  unique (user_id, assessment_id)
);

create table if not exists public.point_adjustments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references auth.users(id) on delete set null,
  admin_id uuid references auth.users(id) on delete set null,
  delta integer not null check (delta <> 0 and delta between -10000 and 10000),
  reason text not null check (length(trim(reason)) between 3 and 500),
  comment text check (comment is null or length(comment) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists quiz_attempts_user_created_idx on public.quiz_attempts (user_id, created_at desc);
create index if not exists quiz_attempts_assessment_idx on public.quiz_attempts (assessment_id);
create index if not exists point_adjustments_student_created_idx on public.point_adjustments (student_id, created_at desc);
create index if not exists profiles_display_name_idx on public.profiles using gin (to_tsvector('simple', display_name));
create index if not exists profiles_email_idx on public.profiles (email);

revoke create on schema public from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.point_adjustments enable row level security;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.current_user_is_admin() from public, anon;
grant execute on function public.current_user_is_admin() to authenticated;

drop policy if exists "Users read own profile and admins read all" on public.profiles;
create policy "Users read own profile and admins read all"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.current_user_is_admin())
  );

drop policy if exists "Users read own attempts and admins read all" on public.quiz_attempts;
create policy "Users read own attempts and admins read all"
  on public.quiz_attempts for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.current_user_is_admin())
  );

drop policy if exists "Admins read point adjustment journal" on public.point_adjustments;
create policy "Admins read point adjustment journal"
  on public.point_adjustments for select to authenticated
  using ((select public.current_user_is_admin()));

revoke all on public.profiles, public.assessments, public.assessment_questions, public.quiz_attempts, public.point_adjustments from public, anon, authenticated;
grant select on public.profiles, public.quiz_attempts, public.point_adjustments to authenticated;

create or replace function public.create_student_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  requested_name text;
begin
  requested_name := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 100);
  insert into public.profiles (id, email, display_name, role)
  values (new.id, lower(new.email), requested_name, 'student')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_student_profile();

create or replace function public.list_assessment_questions(p_slug text)
returns table (assessment_id uuid, assessment_slug text, assessment_title text, question_id uuid, position integer, prompt text, choices jsonb)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.id, a.slug, a.title, q.id, q.position, q.prompt, q.choices
  from public.assessments as a
  join public.assessment_questions as q on q.assessment_id = a.id
  where a.slug = p_slug and a.active
  order by q.position;
$$;

create or replace function public.submit_assessment(
  p_slug text,
  p_client_attempt_id uuid,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  assessment_row public.assessments%rowtype;
  existing_attempt public.quiz_attempts%rowtype;
  question_row public.assessment_questions%rowtype;
  supplied_answer text;
  answer_count integer;
  total_questions integer;
  correct_answers integer := 0;
  new_attempt public.quiz_attempts%rowtype;
  normalized_answers jsonb := '[]'::jsonb;
  was_duplicate boolean := false;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_client_attempt_id is null or jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Invalid attempt payload' using errcode = '22023';
  end if;
  if octet_length(p_answers::text) > 16384 then
    raise exception 'Attempt payload too large' using errcode = '22023';
  end if;

  select * into existing_attempt
  from public.quiz_attempts
  where user_id = actor_id and client_attempt_id = p_client_attempt_id;
  if found then
    return jsonb_build_object(
      'attempt_id', existing_attempt.id,
      'score', existing_attempt.score,
      'max_score', existing_attempt.max_score,
      'correct_count', existing_attempt.correct_count,
      'question_count', existing_attempt.question_count,
      'created_at', existing_attempt.created_at,
      'duplicate', true
    );
  end if;

  select * into assessment_row from public.assessments where slug = p_slug and active;
  if not found then
    raise exception 'Assessment not available' using errcode = '22023';
  end if;

  select * into existing_attempt
  from public.quiz_attempts
  where user_id = actor_id and assessment_id = assessment_row.id;
  if found then
    return jsonb_build_object(
      'attempt_id', existing_attempt.id,
      'score', existing_attempt.score,
      'max_score', existing_attempt.max_score,
      'correct_count', existing_attempt.correct_count,
      'question_count', existing_attempt.question_count,
      'created_at', existing_attempt.created_at,
      'duplicate', true
    );
  end if;

  select count(*) into total_questions
  from public.assessment_questions where assessment_id = assessment_row.id;
  select jsonb_array_length(p_answers) into answer_count;
  if answer_count <> total_questions then
    raise exception 'Answers do not match assessment' using errcode = '22023';
  end if;

  for question_row in
    select * from public.assessment_questions
    where assessment_id = assessment_row.id
    order by position
  loop
    select answer into supplied_answer
    from (
      select value ->> 'question_id' as question_id, value ->> 'answer' as answer
      from jsonb_array_elements(p_answers)
    ) as submitted
    where submitted.question_id = question_row.id::text;

    if not found or supplied_answer is null
      or not exists (
        select 1 from jsonb_array_elements_text(question_row.choices) as choice(value)
        where choice.value = supplied_answer
      )
    then
      raise exception 'Invalid answer selection' using errcode = '22023';
    end if;

    if supplied_answer = question_row.correct_answer then
      correct_answers := correct_answers + 1;
    end if;
    normalized_answers := normalized_answers || jsonb_build_array(
      jsonb_build_object('question_id', question_row.id, 'answer', supplied_answer)
    );
  end loop;

  insert into public.quiz_attempts (
    user_id, assessment_id, client_attempt_id, answers,
    correct_count, question_count, score, max_score
  )
  values (
    actor_id, assessment_row.id, p_client_attempt_id, normalized_answers,
    correct_answers, total_questions,
    correct_answers * 10, total_questions * 10
  )
  on conflict do nothing
  returning * into new_attempt;

  if new_attempt.id is null then
    was_duplicate := true;
    select * into new_attempt from public.quiz_attempts
    where user_id = actor_id
      and (client_attempt_id = p_client_attempt_id or assessment_id = assessment_row.id)
    order by (client_attempt_id = p_client_attempt_id) desc
    limit 1;
  end if;

  return jsonb_build_object(
    'attempt_id', new_attempt.id,
    'score', new_attempt.score,
    'max_score', new_attempt.max_score,
    'correct_count', new_attempt.correct_count,
    'question_count', new_attempt.question_count,
    'created_at', new_attempt.created_at,
    'duplicate', was_duplicate
  );
end;
$$;

create or replace function public.get_my_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  result jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'profile', jsonb_build_object('display_name', p.display_name, 'email', p.email, 'role', p.role),
    'total_points',
      coalesce((select sum(a.score) from public.quiz_attempts as a where a.user_id = actor_id), 0)
      + coalesce((select sum(pa.delta) from public.point_adjustments as pa where pa.student_id = actor_id), 0),
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', qa.id,
          'assessment_slug', ass.slug,
          'assessment_title', ass.title,
        'score', qa.score,
        'max_score', qa.max_score,
        'correct_count', qa.correct_count,
        'question_count', qa.question_count,
        'created_at', qa.created_at
      ) order by qa.created_at desc)
      from public.quiz_attempts as qa
      join public.assessments as ass on ass.id = qa.assessment_id
      where qa.user_id = actor_id
    ), '[]'::jsonb)
  )
  into result
  from public.profiles as p
  where p.id = actor_id;

  if result is null then raise exception 'Profile not found' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create or replace function public.admin_search_students(p_search text default null)
returns table (
  id uuid,
  display_name text,
  email text,
  role text,
  total_points bigint,
  attempt_count bigint,
  average_percent integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.profiles as actor where actor.id = auth.uid() and actor.role = 'admin') then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
  select p.id, p.display_name, p.email, p.role,
    coalesce((select sum(qa.score) from public.quiz_attempts as qa where qa.user_id = p.id), 0)
      + coalesce((select sum(pa.delta) from public.point_adjustments as pa where pa.student_id = p.id), 0),
    (select count(*) from public.quiz_attempts as qa where qa.user_id = p.id),
    coalesce((select round(avg(qa.correct_count::numeric * 100 / nullif(qa.question_count, 0)))::integer from public.quiz_attempts as qa where qa.user_id = p.id), 0)
  from public.profiles as p
  where p.role = 'student'
    and (
      nullif(trim(p_search), '') is null
      or p.display_name ilike '%' || trim(p_search) || '%'
      or p.email ilike '%' || trim(p_search) || '%'
    )
  order by p.display_name;
end;
$$;

create or replace function public.admin_student_detail(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  result jsonb;
begin
  if not exists (select 1 from public.profiles as actor where actor.id = auth.uid() and actor.role = 'admin') then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id, 'display_name', p.display_name, 'email', p.email, 'role', p.role,
      'total_points',
        coalesce((select sum(qa.score) from public.quiz_attempts as qa where qa.user_id = p.id), 0)
        + coalesce((select sum(pa.delta) from public.point_adjustments as pa where pa.student_id = p.id), 0),
      'attempt_count', (select count(*) from public.quiz_attempts as qa where qa.user_id = p.id),
      'average_percent', coalesce((select round(avg(qa.correct_count::numeric * 100 / nullif(qa.question_count, 0)))::integer from public.quiz_attempts as qa where qa.user_id = p.id), 0)
    ),
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', qa.id, 'assessment_slug', ass.slug, 'assessment_title', ass.title, 'score', qa.score, 'max_score', qa.max_score,
        'correct_count', qa.correct_count, 'question_count', qa.question_count, 'created_at', qa.created_at
      ) order by qa.created_at desc)
      from public.quiz_attempts as qa
      join public.assessments as ass on ass.id = qa.assessment_id
      where qa.user_id = p.id
    ), '[]'::jsonb),
    'adjustments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pa.id, 'delta', pa.delta, 'reason', pa.reason, 'comment', pa.comment,
        'created_at', pa.created_at, 'actor_name', coalesce(actor.display_name, 'Аккаунт жойылған')
      ) order by pa.created_at desc)
      from public.point_adjustments as pa
      left join public.profiles as actor on actor.id = pa.admin_id
      where pa.student_id = p.id
    ), '[]'::jsonb)
  ) into result
  from public.profiles as p
  where p.id = p_user_id and p.role = 'student';

  if result is null then raise exception 'Student profile not found' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create or replace function public.admin_adjust_points(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  adjustment_id uuid;
begin
  if not exists (select 1 from public.profiles as actor where actor.id = auth.uid() and actor.role = 'admin') then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 or p_delta < -10000 or p_delta > 10000
    or p_reason is null or length(trim(p_reason)) < 3 or length(p_reason) > 500
    or length(coalesce(p_comment, '')) > 1000
  then
    raise exception 'Invalid point adjustment' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles as student where student.id = p_user_id and student.role = 'student') then
    raise exception 'Student profile not found' using errcode = 'P0002';
  end if;

  insert into public.point_adjustments (student_id, admin_id, delta, reason, comment)
  values (p_user_id, auth.uid(), p_delta, trim(p_reason), nullif(trim(p_comment), ''))
  returning id into adjustment_id;
  return adjustment_id;
end;
$$;

revoke all on function public.create_student_profile() from public, anon, authenticated;
revoke all on function public.list_assessment_questions(text) from public;
revoke all on function public.submit_assessment(text, uuid, jsonb) from public, anon;
revoke all on function public.get_my_dashboard() from public, anon;
revoke all on function public.admin_search_students(text) from public, anon;
revoke all on function public.admin_student_detail(uuid) from public, anon;
revoke all on function public.admin_adjust_points(uuid, integer, text, text) from public, anon;

grant execute on function public.list_assessment_questions(text) to anon, authenticated;
grant execute on function public.submit_assessment(text, uuid, jsonb) to authenticated;
grant execute on function public.get_my_dashboard() to authenticated;
grant execute on function public.admin_search_students(text) to authenticated;
grant execute on function public.admin_student_detail(uuid) to authenticated;
grant execute on function public.admin_adjust_points(uuid, integer, text, text) to authenticated;

insert into public.assessments (id, slug, title, active)
values ('10000000-0000-4000-8000-000000000001', 'kazakh-history-basics', 'Қазақстан тарихы: ұлт-азаттық көтерілістер', true)
on conflict (slug) do update set title = excluded.title, active = excluded.active;

insert into public.assessment_questions (id, assessment_id, position, prompt, choices, correct_answer, explanation)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 'Кенесары Қасымұлы көтерілісі қашан басталды?', '["1837","1836","1841","1916"]', '1837', 'Кенесары көтерілісі 1837 жылы басталды және 1847 жылға дейін созылды.'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 2, 'Сырым Датұлы көтерілісіне қай жылдар сәйкес келеді?', '["1783–1797","1800–1805","1836–1838","1847–1849"]', '1783–1797', 'Сырым Датұлы көтерілісі 1783–1797 жылдар аралығында болды.'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 3, 'Ақмола бекінісіне шабуыл қай жылы жасалды?', '["1838","1822","1841","1868"]', '1838', 'Ақмола бекінісіне шабуыл 1838 жылы өтті.'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 4, 'Кенесарының хан сайлануы қай жылы болды?', '["1841","1836","1824","1916"]', '1841', 'Кенесары 1841 жылы хан сайланды.'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 5, 'Кенесары көтерілісінің аяқталуы қай жылмен белгіленеді?', '["1847","1838","1867","1841"]', '1847', 'Кенесары көтерілісі 1847 жылы аяқталды.'),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', 6, 'Исатай Тайманұлы мен Махамбет Өтемісұлы қозғалысы қай жылдарға тиесілі?', '["1836–1838","1824–1828","1847–1850","1916–1917"]', '1836–1838', 'Бұл қозғалыс 1836–1838 жылдары болды.'),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', 7, 'Кенесары көтерілісінің ұлт-азаттық сипатын неден анықтаймыз?', '["Халықтың дербестік үшін күресі","Салықтарды азайту","Бір ғана дәмді тағам","Шаруаларға жүрулікті шектеу"]', 'Халықтың дербестік үшін күресі', 'Көтеріліс жер, билік және ұлттық дербестік үшін ұйымдастырылды.'),
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000001', 8, 'Ресейдің негізгі әскери басқару нүктесі ретінде қай бекініс маңызды болды?', '["Ақмола бекінісі","Париж","Стамбул","Мәскеу"]', 'Ақмола бекінісі', 'Ақмола бекінісі Ресейдің әскери-әкімшілік нүктесі ретінде маңызды рөл атқарды.'),
  ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000001', 9, 'Кенесары көтерілісінің басты саяси мақсаты қандай болды?', '["Азаматтық және саяси дербестік","Тек өнеркәсіпті дамыту","Тек қала тұрғындарын қорғау","Әскери озаттық"]', 'Азаматтық және саяси дербестік', 'Көтеріліс жер, билік және ұлттық дербестік үшін өрбіді.'),
  ('20000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000001', 10, 'Көтерілістің жеңілуіне ықпал еткен факторлардың бірі қандай?', '["Ресейдің әскери басымдығы","Ерекше табиғат","Тек шетелдік достар","Халықтың толық келісімі"]', 'Ресейдің әскери басымдығы', 'Ресейдің әскери, логистикалық және әкімшілік ресурстары көтерілісті басуға ықпал етті.')
on conflict (id) do update set prompt = excluded.prompt, choices = excluded.choices, correct_answer = excluded.correct_answer, explanation = excluded.explanation;

create table if not exists public.survey_questions (
  id smallint primary key check (id between 1 and 10),
  kind text not null check (kind in ('open', 'closed', 'multiple')),
  prompt text not null,
  options jsonb,
  correct_answers jsonb,
  check (options is null or jsonb_typeof(options) = 'array'),
  check (correct_answers is null or jsonb_typeof(correct_answers) = 'array'),
  check (
    (kind = 'open' and options is null and correct_answers is null)
    or (kind in ('closed', 'multiple') and jsonb_typeof(options) = 'array' and jsonb_array_length(options) >= 2)
  )
);

create table if not exists public.survey_submissions (
  id uuid primary key default gen_random_uuid(),
  respondent_name text not null check (length(trim(respondent_name)) between 2 and 100),
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists survey_submissions_created_idx
  on public.survey_submissions (created_at desc);

alter table public.survey_questions enable row level security;
alter table public.survey_submissions enable row level security;

revoke all on public.survey_questions, public.survey_submissions
  from public, anon, authenticated;
grant all on public.survey_questions, public.survey_submissions to service_role;

insert into public.survey_questions (id, kind, prompt, options, correct_answers)
values
  (1, 'open', 'Қазақстандағы ұлт-азаттық көтерілістер туралы оқығанда, сізді ең алдымен қандай сұрақ қызықтырады?', null, null),
  (2, 'closed', 'Кенесары Қасымұлы бастаған көтеріліс 1837 жылы басталды ма?', '["Иә","Жоқ"]', '["Иә"]'),
  (3, 'multiple', 'Кенесары Қасымұлы көтерілісіне қатысты дұрыс деректерді таңдаңыз.', '["Көтеріліс 1837–1847 жылдары болды","Кенесары 1841 жылы хан сайланды","1838 жылы Ақмола бекінісіне шабуыл жасалды","Көтеріліс 1783 жылы басталды"]', '["Көтеріліс 1837–1847 жылдары болды","Кенесары 1841 жылы хан сайланды","1838 жылы Ақмола бекінісіне шабуыл жасалды"]'),
  (4, 'closed', 'Исатай Тайманұлы мен Махамбет Өтемісұлы бастаған қозғалыс 1836–1838 жылдары өтті ме?', '["Иә","Жоқ"]', '["Иә"]'),
  (5, 'multiple', 'Сырым Датұлы көтерілісіне қатысты дұрыс сипаттамаларды таңдаңыз.', '["Көтеріліс 1783–1797 жылдары болды","Отарлық саясат пен жер мәселесіне қарсы бағытталды","Кіші жүз аумағын қамтыды","1916 жылғы көтерілістің жетекшісі болды"]', '["Көтеріліс 1783–1797 жылдары болды","Отарлық саясат пен жер мәселесіне қарсы бағытталды","Кіші жүз аумағын қамтыды"]'),
  (6, 'open', 'Жер мәселесі мен отарлық әкімшілік өзгерістер халықтың өміріне қалай әсер етті деп ойлайсыз?', null, null),
  (7, 'multiple', '1916 жылғы ұлт-азаттық көтеріліске қатысты дұрыс тұжырымдарды таңдаңыз.', '["25 маусым жарлығы бойынша тыл жұмысына адам алу наразылық туғызды","Жердің тартып алынуы мен отарлық қысым себептердің бірі болды","Торғай өңірінде көтеріліске Амангелді Иманов қатысты","Қозғалыс Кенесары хан тұсында өтті"]', '["25 маусым жарлығы бойынша тыл жұмысына адам алу наразылық туғызды","Жердің тартып алынуы мен отарлық қысым себептердің бірі болды","Торғай өңірінде көтеріліске Амангелді Иманов қатысты"]'),
  (8, 'closed', 'Сырым Датұлы көтерілісі Кенесары Қасымұлы көтерілісінен бұрын болды ма?', '["Иә","Жоқ"]', '["Иә"]'),
  (9, 'multiple', 'Төмендегі қай қозғалыстар Қазақстандағы ұлт-азаттық күрес тарихына жатады?', '["Сырым Датұлы көтерілісі (1783–1797)","Исатай мен Махамбет көтерілісі (1836–1838)","Кенесары Қасымұлы көтерілісі (1837–1847)","1916 жылғы ұлт-азаттық көтеріліс"]', '["Сырым Датұлы көтерілісі (1783–1797)","Исатай мен Махамбет көтерілісі (1836–1838)","Кенесары Қасымұлы көтерілісі (1837–1847)","1916 жылғы ұлт-азаттық көтеріліс"]'),
  (10, 'open', 'Тарихи көтерілістерді жақсырақ түсіну үшін қандай материал немесе тақырып қосар едіңіз?', null, null)
on conflict (id) do update
set kind = excluded.kind,
    prompt = excluded.prompt,
    options = excluded.options,
    correct_answers = excluded.correct_answers;

create or replace function public.get_public_survey_results()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  total_responses integer;
  question_row record;
  response_count integer;
  correct_count integer;
  option_row record;
  option_count integer;
  option_results jsonb;
  question_results jsonb := '[]'::jsonb;
begin
  select count(*) into total_responses from public.survey_submissions;

  for question_row in
    select id, kind, options, correct_answers
    from public.survey_questions
    order by id
  loop
    select count(*) into response_count
    from public.survey_submissions
    where answers ? question_row.id::text;

    option_results := '[]'::jsonb;
    if question_row.kind <> 'open' then
      for option_row in
        select value as label
        from jsonb_array_elements_text(question_row.options)
      loop
        select count(*) into option_count
        from public.survey_submissions as submission
        cross join lateral jsonb_array_elements_text(
          case jsonb_typeof(submission.answers -> question_row.id::text)
            when 'array' then submission.answers -> question_row.id::text
            when 'string' then jsonb_build_array(submission.answers ->> question_row.id::text)
            else '[]'::jsonb
          end
        ) as selected(value)
        where selected.value = option_row.label;

        option_results := option_results || jsonb_build_array(
          jsonb_build_object('label', option_row.label, 'count', option_count)
        );
      end loop;
    end if;

    correct_count := null;
    if question_row.correct_answers is not null then
      select count(*) into correct_count
      from public.survey_submissions as submission
      where (
        select coalesce(array_agg(selected.value order by selected.value), array[]::text[])
        from jsonb_array_elements_text(
          case jsonb_typeof(submission.answers -> question_row.id::text)
            when 'array' then submission.answers -> question_row.id::text
            when 'string' then jsonb_build_array(submission.answers ->> question_row.id::text)
            else '[]'::jsonb
          end
        ) as selected(value)
      ) = (
        select coalesce(array_agg(correct.value order by correct.value), array[]::text[])
        from jsonb_array_elements_text(question_row.correct_answers) as correct(value)
      );
    end if;

    question_results := question_results || jsonb_build_array(
      jsonb_build_object(
        'id', question_row.id,
        'responseCount', response_count,
        'correctCount', correct_count,
        'options', option_results
      )
    );
  end loop;

  return jsonb_build_object(
    'respondentCount', total_responses,
    'questions', question_results
  );
end;
$$;

revoke all on function public.get_public_survey_results() from public;
grant execute on function public.get_public_survey_results() to anon, authenticated;
