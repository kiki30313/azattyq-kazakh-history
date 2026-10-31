import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BookOpenText,
  BrainCircuit,
  Clock3,
  Globe,
  MapPinned,
  Menu,
  Moon,
  Play,
  Printer,
  Search,
  SunMedium,
  Trophy,
  Users,
  X,
} from 'lucide-react'
import steppeArtwork from './assets/steppe-hero.svg'
import heroPhoto from '../d6069ace81b84925.webp'
import HistoryTutor, { type ChatMessage } from './components/HistoryTutor'
import { AdminDashboard, AuthPage, StudentDashboard } from './components/AccountPages'
import { AuthProvider } from './components/AuthContext'
import { useAuth } from './components/useAuth'
import SurveyExperience from './components/SurveyExperience'
import VerifiedQuiz from './components/VerifiedQuiz'

type TimelineEvent = {
  year: string
  title: string
  description: string
}

type MapLocation = {
  name: string
  period: string
  description: string
  people: string
  left: string
  top: string
}

type Thesis = {
  title: string
  explanation: string
  example: string
}

type Fact = {
  category: string
  title: string
  date: string
  description: string
}

type Person = {
  name: string
  years: string
  role: string
  movement: string
  description: string
}

type GlossaryItem = {
  term: string
  definition: string
  example: string
}

type DetectiveCase = {
  question: string
  options: { label: string; text: string }[]
  answer: string
  explanation: string
}

type GameKey = 'quiz' | 'matching' | 'identity' | 'order' | 'detective'

type GameResult = {
  done: boolean
  score: number
  correct: number
  wrong: number
  percent: number
}

const navItems = [
  { id: 'home', label: 'Басты бет' },
  { id: 'map', label: 'Тарихи карта' },
  { id: 'timeline', label: 'Хронология' },
  { id: 'knowledge', label: 'Тарихи деректер' },
  { id: 'study', label: 'Оқу материалы' },
  { id: 'games', label: 'Сауалнама' },
  { id: 'library', label: 'Сөздік және AI тарихшы' },
  { id: 'result', label: 'Нәтиже' },
] as const

type PageId = (typeof navItems)[number]['id'] | 'login' | 'register' | 'reset-password' | 'profile' | 'admin'

const primaryNav: { id: PageId; label: string }[] = [
  { id: 'home', label: 'Басты бет' },
  { id: 'timeline', label: 'Көтерілістер' },
  { id: 'timeline', label: 'Хронология' },
  { id: 'knowledge', label: 'Тұлғалар' },
  { id: 'knowledge', label: 'Деректер' },
  { id: 'games', label: 'Сауалнама' },
]

const pageAliases: Record<string, PageId> = {
  theses: 'knowledge',
  facts: 'knowledge',
  people: 'knowledge',
  glossary: 'library',
  tutor: 'library',
}

const getPageFromHash = (): PageId => {
  const hash = window.location.hash.slice(1).replace(/^\/+/, '')
  if (['login', 'register', 'reset-password', 'profile', 'admin'].includes(hash)) return hash as PageId
  const path = window.location.pathname.replace(/\/+$/, '').split('/').pop() ?? ''
  const pathPage = ['login', 'register', 'reset-password', 'profile', 'admin'].find((page) => page === path)
  if (pathPage) return pathPage as PageId
  return navItems.find((item) => item.id === hash)?.id ?? pageAliases[hash] ?? 'home'
}

const timelineData: TimelineEvent[] = [
  { year: '1783–1797', title: 'Сырым Датұлы көтерілісі', description: 'Сырым Датұлы бастаған көтеріліс қазақ жеріндегі жаппай қарсы қозғалыс ретінде Ресейдің отарлау саясатындағы алғашқы маңызды наразылықты білдірді.' },
  { year: '1822', title: '«Сібір қырғыздары туралы жарғы»', description: 'Ресей әкімшілігінің саяси-әкімшілік құрылымын күшейтуге бағытталған жарғы қазақ қоғамындағы билік құрылымдарын әлсіретті.' },
  { year: '1824', title: 'Кіші жүздегі хандық биліктің жойылуы', description: 'Кіші жүзде хандық билік жойылып, Ресейдің әскери-әкімшілік жүйесі кеңейіп, жергілікті басқару құрылымы өзгерді.' },
  { year: '1836–1838', title: 'Исатай мен Махамбет көтерілісі', description: 'Оңтүстік және Орал аймағындағы қанды қақтығыстар қазақ халқының отаршылдыққа қарсы күресінің екінші кезеңін белгіледі.' },
  { year: '1837–1847', title: 'Кенесары Қасымұлы бастаған көтеріліс', description: 'Бұл қозғалыс қазақ даласының көлемді және ұзаққа созылған ұлт-азаттық күресінің ең маңызды кезеңі болды.' },
  { year: '1838', title: 'Ақмола бекінісіне шабуыл', description: 'Ақмола бекінісіне жасалған шабуыл отарлау жүйесіне қарсы қозғалыстың әскери сипатта күшейгенін көрсетті.' },
  { year: '1841', title: 'Кенесарының хан сайлануы', description: 'Кенесарының халықаралық-әскери және саяси мәртебесін нығайтуға мүмкіндік берді, ол қазақ қоғамын біріктіруге талпынды.' },
  { year: '1847', title: 'Көтерілістің аяқталуы', description: 'Көтеріліс Ресейдің әскери күшімен басылып, көптеген жетекші тұлғалар, соның ішінде Кенесары, жеңіліске ұшырады.' },
  { year: '1867–1868', title: 'Әкімшілік реформалар', description: 'Жаңа басқару жүйелері әкімшілік құрылымдарды қайта ұйымдастырумен бірге қазақ қоғамында дақылыңдылықты күшейтті.' },
  { year: '1916', title: 'Ұлт-азаттық көтеріліс', description: 'Жаңа ғасырдағы қозғалыс Қазақстанда отаршылыққа қарсы ұлт-азаттық сезімнің жаңа кезеңін көрсетті.' },
]

const mapLocations: MapLocation[] = [
  { name: 'Бөкей Ордасы мен Жайық маңы', period: '1836–1838', description: 'Исатай Тайманұлы мен Махамбет Өтемісұлы бастаған көтерілістің негізгі ошақтары осы өңірде болды.', people: 'Исатай Тайманұлы, Махамбет Өтемісұлы', left: '25%', top: '53%' },
  { name: 'Көкшетау өңірі', period: '1837–1840', description: 'Кенесары қозғалысының алғашқы кезеңінде хан жасағы белсенді әрекет еткен өңірлердің бірі.', people: 'Кенесары Қасымұлы, Наурызбай батыр', left: '57%', top: '34%' },
  { name: 'Ақмола бекінісі', period: '1838', description: '1838 жылы Кенесары жасағы Ақмола бекінісіне шабуыл жасады. Бекініс қазіргі Астана қаласының орнында орналасқан.', people: 'Кенесары Қасымұлы, Наурызбай батыр', left: '60%', top: '44%' },
  { name: 'Торғай даласы', period: '1838–1845', description: 'Кенесары қозғалысы кең жайылған кезеңде Торғай даласы маңызды қоныс және әскери әрекет аймағына айналды.', people: 'Кенесары Қасымұлы, Ағыбай батыр', left: '45%', top: '55%' },
  { name: 'Ұлытау өңірі', period: '1838–1840', description: 'Сарыарқаның орталық бөлігіндегі Ұлытау өңірі көтерілісшілердің маңызды тірек аймақтарының бірі болды.', people: 'Кенесары Қасымұлы, Ағыбай батыр', left: '51%', top: '65%' },
  { name: 'Шу өңірі', period: '1846–1847', description: 'Кенесары жасағы оңтүстікке қарай жылжыды. 1847 жылғы соңғы жорық қазіргі Қырғызстан аумағында аяқталды.', people: 'Кенесары Қасымұлы, Наурызбай батыр', left: '69%', top: '73%' },
]

const theses: Thesis[] = [
  { title: '1. Жер мәселесі', explanation: 'Ресейдің отарлау саясаты қазақ халқының дәстүрлі жайылым, шабындық және суару жерлеріне қол сұғуын күшейтті. Бұл жағдай қауымдық құрылымның бұзылуына алып келді.', example: 'Кенесары қозғалысының қанаттарында жер аумақтарын қорғау, байлық пен өмір сүру үшін берік ұстаным маңызды болды.' },
  { title: '2. Ресей империясының әскери бекіністер салуы', explanation: 'Бекіністер мен гарнизондар қазақ даласына әскери бақылау енгізді. Олар жерлерді бақылау, әкімшілік тізімдерді күшейту және наразылықты басу үшін қолданылды.', example: 'Ақмола бекінісі, басқа да әскери құрылыстар отарлық аппараттың саяси ықпалын күшейтті.' },
  { title: '3. Дәстүрлі хандық биліктің жойылуы', explanation: 'Хандық билік, би және сұлтандар дәстүрлі басқару жүйесінің негізі болды. Оның жойылуы әлеуметтік тұрақтылықты бұзды.', example: 'Кіші жүздегі хандық биліктің жойылуы мен әкімшілік реформалар осы өзгерістердің көрінісі болды.' },
  { title: '4. Әкімшілік реформалар', explanation: 'Ресейдің басқару жүйесін күшейту және қазақ даласының әкімшілік құрылымын қайта құруы жергілікті қауымдар үшін жаңа ауыртпалықтар жасады.', example: '«Сібір қырғыздары туралы жарғы» және 1824 жылғы реформалар басқаруды күшейтіп, жергілікті реттеу жүйесін бұзды.' },
  { title: '5. Алым-салық пен міндеткерліктер', explanation: 'Жаңа әкімшілік жүйе артық салық, міндеттемелер және әскери қызмет 부담дарын арттырды. Бұл адамдардың өмірі мен байлығы үшін ауыр салдар туғызды.', example: 'Салықты көбейту және міндеткерлікті күшейту көтерілістердің экономикалық негізін қалыптастырды.' },
  { title: '6. Жергілікті билеушілер мен отарлық әкімшіліктің саясаты', explanation: 'Отарлық әкімшілік жекелеген билеушілерді өзіне қарсы қаратты. Кейбір топтар Ресей тарапынан қолдау тапса, басқалары наразылық білдірді.', example: 'Жергілікті билеу және әскерилер арасындағы саяси тартыстар қуатты көтеріліске түрткі болды.' },
  { title: '7. Ұлттық дербестікті сақтау талабы', explanation: 'Қазақ қоғамының өздігінен өмір сүруі, дәстүрлі мәдениеті мен әлеуметтік құрылымы сақталуы қажет еді. Осы қажеттілік қозғалыстың идеологиялық негізі болды.', example: 'Ұлт-азаттық қозғалыстарда ұлттық тәуелсіздік, құқық, жер мен өз билік идеясы басты орын алды.' },
  { title: '8. Кенесарының орталықтанған мемлекет құру әрекеті', explanation: 'Кенесары өз билігін күшейтіп, қазақ жерлерін біріктіру, одақ құру және әскери қабілетін нығайтуға ұмтылды.', example: 'Кенесары хандық билік құру, әскери одақтарды нығайту және күштірек ұйымдасқан күрес жүргізу бағытында жұмыс істеді.' },
  { title: '9. Көтерілістердің жеңілу себептері', explanation: 'Қозғалыстардың кезеңдері ұзақ, бірақ Ресей империясының әскери, экономикалық және әкімшілік ресурстары олардан асып түсті.', example: 'Уақыт, қару-жарақ, коммуникация, ұйымдасқан әскери құрылымдар Кенесары қозғалысының жеңілісіне ықпал етті.' },
  { title: '10. Ұлт-азаттық қозғалыстардың тарихи мұрасы', explanation: 'Көтерілістер қазақ халқының ұлттық сана-сезімінің, тарихи жадының және қоғамдық бірігуінің әрі қарай дамуын қамтамасыз етті.', example: 'Олар кейінгі ұлт-азаттық идеялардың, жаңа ұлттық тарихтың және ұлт мүдделерінің қалыптасуына ықпал етті.' },
]

const facts: Fact[] = [
  { category: 'Себептері мен алғышарттары', title: 'Кіші жүзге Ресейдің ықпалы күшейді', date: '1820–1824', description: 'Ресейдің әкімшілік және әскери бақылауы күшейіп, қазақ қоғамында саяси қысым артты.' },
  { category: 'Себептері мен алғышарттары', title: 'Хандық биліктің әлсіреуі', date: '1820-жылдары', description: 'Тәуелсіз хандық институттар жойылып, жергілікті басқару және қоғамдық бірлік зақымданды.' },
  { category: 'Себептері мен алғышарттары', title: 'Жерге қол сұғу', date: 'XIX ғасырдың алғашқы жартысы', description: 'Әскери бекіністер мен әкімшілік реформалар жерді, жайылымдарды, суару арнастарын бақылауға бағыттады.' },
  { category: 'Себептері мен алғышарттары', title: 'Салық ауыртпалығы', date: 'XIX ғасыр', description: 'Жаңа салықтар мен міндеттемелер қазақ шаруаларына экономикалық қысым жасады.' },
  { category: 'Себептері мен алғышарттары', title: 'Әскери бекіністердің кеңеюі', date: '1820–1840', description: 'Отарлау саясаты бекіністер арқылы даланы әскери-әкімшілік бақылауында ұстап қала берді.' },
  { category: 'Себептері мен алғышарттары', title: 'Жергілікті билеушілердің саясаты', date: 'XIX ғасыр', description: 'Кейбір билеушілер Ресейдің ықпалында қалып, көтеріліске қарсы әрекет көрсетті.' },
  { category: 'Себептері мен алғышарттары', title: 'Ұлт-азаттық идеялардың күшеюі', date: '1830-жылдары', description: 'Ұлттық дербестік, тәуелсіздік және құқық идеялары қоғамда кең етті.' },
  { category: 'Себептері мен алғышарттары', title: 'Батыс және Оңтүстік қазақ жерлері', date: '1836–1838', description: 'Оңтүстік өңірлерде елеулі наразылықтар туындады, бұл басқа қозғалыстардың басталуына түрткі болды.' },
  { category: 'Себептері мен алғышарттары', title: 'Жасақтың әскери ұғымы', date: '1830–1840', description: 'Жергілікті қуаттар мен батырлар көтеріліс үшін әскери ұйымдастырушылық қабілеттерін арттырды.' },
  { category: 'Себептері мен алғышарттары', title: 'Әлеуметтік теңсіздік', date: 'XIX ғасыр', description: 'Әкімшілік құрылымның жаңа теңсіздігі халықтың наразылығын арттырды.' },
  { category: 'Барысы мен маңызды оқиғалары', title: 'Сырым Датұлы көтерілісі', date: '1783–1797', description: 'Бастапқы күшті қозғау ретінде Ресейге қарсы күрес ұйымдастырылды.' },
  { category: 'Барысы мен маңызды оқиғалары', title: 'Исатай Тайманұлы мен Махамбет Өтемісұлы', date: '1836–1838', description: 'Бұл қозғалыс Оңтүстік және Жайық маңындағы маңызды наразылықтарды біріктірді.' },
  { category: 'Барысы мен маңызды оқиғалары', title: 'Кенесарының хан сайлануы', date: '1841', description: 'Кенесары елді жұмылдырып, орталықтанған саяси билікке ұмтылды.' },
  { category: 'Барысы мен маңызды оқиғалары', title: 'Ақмола бекінісіне шабуыл', date: '1838', description: 'Ресейдің әскери базасына қарсы бағытталған шабуыл қозғалыстың әскери дәрежесін көрсетті.' },
  { category: 'Барысы мен маңызды оқиғалары', title: 'Көкшетау өңіріндегі шайқастар', date: '1837–1840', description: 'Бұл аймақ Кенесары қозғалысының негізгі әскери және саяси орбитасы болды.' },
  { category: 'Барысы мен маңызды оқиғалары', title: 'Ұлытау майдандары', date: '1837–1847', description: 'Ұлытау әскери стратегияда маңызды орын алды, бұл көтеріліс қауымдық дамуын білдірді.' },
  { category: 'Барысы мен маңызды оқиғалары', title: 'Жетісу бағытындағы соңғы оқиғалар', date: '1840–1847', description: 'Кенесары көтерілісінің соңғы жылдары Жетісу мен Қырғызстан аумағы да маңызды роль атқарды.' },
  { category: 'Барысы мен маңызды оқиғалары', title: 'Ресейдің жауап реакциясы', date: '1837–1847', description: 'Әскерилер, билік аппараты және логистика қозғалысты әскери жолмен басып тастады.' },
  { category: 'Барысы мен маңызды оқиғалары', title: 'Масштабтылығы', date: '1837–1847', description: 'Көтеріліс тек бір аймақпен шектелмей, Қазақстанның кең аумағына таралып, күрделі ұйымдасқан қозғалысқа айналды.' },
  { category: 'Барысы мен маңызды оқиғалары', title: 'Кеңесілер және батырлар', date: '1837–1847', description: 'Батырлар мен билер қозғалыс жетекшілерінің әскери-идеологиялық күшін қалыптастырды.' },
  { category: 'Нәтижелері, жеңілу себептері және тарихи маңызы', title: 'Көтерілістің басып-жануы', date: '1847', description: 'Ресейдің әскери басымдылығы оны жеңіске жеткізді; бұл қозғалыстың ұзақ уақыт дәлелденген факторлары болды.' },
  { category: 'Нәтижелері, жеңілу себептері және тарихи маңызы', title: 'Ұлттық сана-сезімнің күшеюі', date: 'XIX ғасырдың екінші жартысы', description: 'Көтеріліс кейінгі ұлт-азаттық қозғалыстар үшін әлеуметтік-идеологиялық негіз жасады.' },
  { category: 'Нәтижелері, жеңілу себептері және тарихи маңызы', title: 'Идеялық мұра', date: 'XIX–XX ғасыр', description: 'Кенесары ұлыстың дербестік идеялары, отаршылыққа қарсы күрес және патриотизм сабақтарын бойына сіңірді.' },
  { category: 'Нәтижелері, жеңілу себептері және тарихи маңызы', title: 'Кейінгі ұлт-азаттық қозғалыстар', date: '1900–1916', description: 'Бұл күрес ХХ ғасырдағы ұлттық қозғалыстардың негізін қалаушы идеологиялық мұра болды.' },
  { category: 'Нәтижелері, жеңілу себептері және тарихи маңызы', title: 'Басқару жүйесінің өзгеруі', date: '1867–1868', description: 'Әкімшілік реформа мен басқару құралдарының қайта құрылуы Қазақстанның отарлық саяси құрылымын түбегейлі өзгеріске ұшыратты.' },
  { category: 'Нәтижелері, жеңілу себептері және тарихи маңызы', title: 'Әскери құрамы', date: '1837–1847', description: 'Ресейдің армиясы, әскери техникалық күші, логистикасы қозғалыстың жеңілу қарқынымен сәйкес келді.' },
  { category: 'Нәтижелері, жеңілу себептері және тарихи маңызы', title: 'Көпшілік қолдау ауқымы', date: '1837–1847', description: 'Көптеген қазақ қауымдарының арасында наразылық болғанымен, идеологиялық, әскери және әкімшілік бірлік толықтай емес болды.' },
  { category: 'Нәтижелері, жеңілу себептері және тарихи маңызы', title: 'Әлеуметтік салдары', date: 'XIX ғасыр', description: 'Көтеріліс қазақ қоғамының ұлттық тұтастығын, тарихи есін, патриоттық намысын әсерлі етті.' },
  { category: 'Нәтижелері, жеңілу себептері және тарихи маңызы', title: 'Тарихнамадағы қайта бағалау', date: 'XX ғасыр', description: 'Кенесары қозғалысы Қазақ тарихының маңызды қозғаушы кезеңі ретінде қайта қаралды.' },
  { category: 'Барысы мен маңызды оқиғалары', title: 'Соңғы жорық', date: '1847', description: 'Кенесары жасағының соңғы жорығы Қырғызстан аумағында аяқталды. Кенесары тұтқынға түсіп, қаза тапты; бұл көтерілістің аяқталуына әкелді.' },
]

const personalities: Person[] = [
  { name: 'Кенесары Қасымұлы', years: '1802–1847', role: 'Хан, әскери қолбасшы', movement: 'Кенесары көтерілісі', description: 'Ресейге қарсы бүкіл қазақ даласын біріктіруге ұмтылған жетекші тұлға.' },
  { name: 'Наурызбай Қасымұлы', years: 'XIX ғасыр', role: 'Қолбасшы, саяси жетекші', movement: 'Кенесары көтерілісі', description: 'Кенесары қозғалысының әскери-әкімшілік құрылымындағы маңызды тұлға.' },
  { name: 'Иман Дулатұлы', years: 'XIX ғасыр', role: 'Батыр, қолбасшы', movement: 'Кенесары көтерілісі', description: 'Көтеріліс тарихында дербес әскери әрекеттерімен танымал тұлға.' },
  { name: 'Ағыбай батыр', years: 'XIX ғасыр', role: 'Батыр', movement: 'Кенесары көтерілісі', description: 'Көтерілістің әскери штабтасқан бір топтың жетекшісі ретінде белгілі.' },
  { name: 'Бұқарбай батыр', years: 'XIX ғасыр', role: 'Батыр, жауынгер', movement: 'Кенесары көтерілісі', description: 'Көтеріліс өрісіндегі батырлық істерімен танымал.' },
  { name: 'Жанқожа Нұрмұхамедұлы', years: 'XIX ғасыр', role: 'Әскербасшы, көмекші жетекші', movement: 'Кенесары көтерілісі', description: 'Оқиғалардың саяси-әскери бағыттарында маңызды рөл атқарған.' },
  { name: 'Сырым Датұлы', years: '1742–1802', role: 'Хан, көтеріліс жетекшісі', movement: 'Сырым Датұлы көтерілісі', description: 'Ресей отарлау саясатына қарсы алғашқы кең көлемді қозғалысқа жетекшілік етті.' },
  { name: 'Исатай Тайманұлы', years: '1791–1838', role: 'Батыр, қозғалыс жетекшісі', movement: 'Исатай мен Махамбет көтерілісі', description: 'Орталық Ресейге қарсы күрестің маңызды көсемдерінің бірі.' },
  { name: 'Махамбет Өтемісұлы', years: '1770–1838', role: 'Ақын, батыр, көтеріліс жетекшісі', movement: 'Исатай мен Махамбет көтерілісі', description: 'Поэзиясы мен батырлық қызметімен бірге, отарлауға қарсы рухтың символы.' },
  { name: 'Әбдіғапар Жанбосынұлы', years: 'XIX ғасыр', role: 'Жауынгер, қолбасшы', movement: 'Кенесары көтерілісі', description: 'Көтерілістің әскери белсенділігін арттыратын жақын жетекшілердің бірі.' },
]

const glossary: GlossaryItem[] = [
  { term: 'Отарлау', definition: 'Бір мемлекеттің немесе империяның басқа ел немесе халықтың аумағына әскери, саяси және экономикалық ықпалын арттыруы.', example: 'Ресей империясы XIX ғасырда Қазақ даласына әскери-әкімшілік бақылау орнатты.' },
  { term: 'Ұлт-азаттық қозғалыс', definition: 'Елдің, ұлттың, халықтың құқықтары мен тәуелсіздігі үшін қозғалған саяси-әлеуметтік күрес.', example: 'Кенесары көтерілісі қазақ халқының ұлттық дербестігі үшін ұйымдастырылған қозғалыс болды.' },
  { term: 'Хандық билік', definition: 'Дәстүрлі қазақ қоғамындағы мемлекеттік басқару жүйесінің жоғарғы деңгейі.', example: 'Кіші жүздегі хандық билік XIX ғасырда Ресейдің әкімшілік реформаларымен жойылды.' },
  { term: 'Әскери бекініс', definition: 'Әскери мақсатта салынған тұрақты қорғау орны, гарнизон мен бақылау нүктесі.', example: 'Ақмола бекінісі Ресейдің даланы бақылауда ұстауына қызмет етті.' },
  { term: 'Салық', definition: 'Мемлекеттің немесе әкімшіліктің қоғамнан алатын қаржылық міндеттемелері.', example: 'Жаңа салық жүйесі қазақ шаруалары үшін қосымша ауыртпалық болды.' },
  { term: 'Жасақ', definition: 'Көтерілістің әскери құрылымы мен ұйымдастырылған күштері.', example: 'Кенесары көтерілісінде жасақтар қозғалысқа әскери ұйымдасым мен пәрмен берді.' },
  { term: 'Батыр', definition: 'Көшпелі қоғамдағы ерлік, батылдық және әскери ерліктермен танылған тұлға.', example: 'Жанқожа, Ағыбай, Бұқарбай батырлар көтеріліс үшін шайқасуда ерекше рөл атқарды.' },
  { term: 'Би', definition: 'Әкімшілік, құқықтық және қоғамдық билік саласындағы дәстүрлі басқарушы, кеңесші.', example: 'Би әкімшілік дауларды шешуде, қоғам алдында әділдік сақтау үшін маңызды функция атқарды.' },
  { term: 'Сұлтан', definition: 'Дәстүрлі басқару жүйесінде нәсіл, ру, топ жетекшісінің шекті дәрежедегі билеуші статусы.', example: 'Көптеген сұлтандар қазақ қоғамында іскерлік, әскери және саяси өмірге ықпал етті.' },
  { term: 'Автономия', definition: 'Ел немесе аймақтың ішкі басқаруда өз бетінше әрекет ету қабілеті.', example: 'Ұлт-азаттық қозғалысты ұйымдастыруда автономиялық құқық сақтаудың маңызы зор болды.' },
  { term: 'Империя', definition: 'Көптеген халықтарды, территорияларды және аймақтарды біріктіретін үлкен, орталықтандырылған мемлекет.', example: 'Ресей империясы XIX ғасырда қазақ жерлерін әкімшілік-әскери бақылауына алды.' },
  { term: 'Әкімшілік реформа', definition: 'Мемлекеттегі басқару жүйесін қайта ұйымдастыру, жаңа құрылымдар енгізу.', example: '«Сібір қырғыздары туралы жарғы» мен 1867–1868 реформалары өзгерістер туғызды.' },
  { term: 'Метрополия', definition: 'Құрама империядағы негізгі, жетекші, әкімшілік-экономикалық орталық.', example: 'Ресей метрополиясы қазақ даласына әкімшілік шектеулер мен әскери қысым жасады.' },
  { term: 'Қозғалыстың қозғаушы күштері', definition: 'Қозғалыстың басталуына, өршуіне және нығаюына әсер ететін әлеуметтік, саяси, экономикалық факторлар.', example: 'Жер мәселесі, құқық бұзылуы, ұлттық сана-сезімі қозғалыстың қозғаушы күштері болды.' },
  { term: 'Ұлттық дербестік', definition: 'Халықтың өз билігі, мәдениеті, қоғамы мен құқықтары мен өмір салтының толық сақталуы.', example: 'Кенесары көтерілісінің идеологиялық қозғаушы күші ұлттық дербестік идеясы болды.' },
]

const matchingPairs = [
  { id: 'syrim', label: 'Сырым Датұлы көтерілісі', value: '1783–1797' },
  { id: 'isatay', label: 'Исатай мен Махамбет көтерілісі', value: '1836–1838' },
  { id: 'kenesary', label: 'Кенесары Қасымұлы көтерілісі', value: '1837–1847' },
  { id: 'reform', label: 'Әкімшілік реформалар', value: '1867–1868' },
  { id: 'revolt', label: '1916 жылғы ұлт-азаттық көтеріліс', value: '1916' },
]

const identityCards = [
  { name: 'Кенесары Қасымұлы', descriptors: ['Мен Ресейге қарсы бүкіл қазақ даласын біріктіруге ұмтылған ханмын.', 'Мен 1837–1847 жылдардағы үздіксіз көтерілістің жетекшісімін.', 'Менің еліміздің құқықтары мен дербестігі үшін күресім соғысқа айналды.'] },
  { name: 'Сырым Датұлы', descriptors: ['Мен 1783–1797 жылдардағы алғашқы ірі көтерілісті басқардым.', 'Мен қазақ жерінде Ресей отарлауына қарсы күрес бастаған тұлғамын.', 'Мен үшін жер мен тәуелсіздік маңызды мақсат болды.'] },
  { name: 'Махамбет Өтемісұлы', descriptors: ['Мен ақын, батыр және қозғалыс жетекшісімін.', 'Мен 1836–1838 жылдардағы қозғалыста ерекше орын алдым.', 'Менің сөзім мен сабағым саяси төзімділікті әрбір қауымға жеткізді.'] },
]

const eventOrderData = ['Көтерілістің басталуы', 'Ақмола бекінісіне шабуыл', 'Хандық билік әлсіреуі', 'Кенесарының хан сайлануы', 'Көтерілістің аяқталуы']

const detectiveCases: DetectiveCase[] = [
  { question: 'Егер жергілікті қоғамда халқымыздың жері мен дәстүрлі билігі зақымдалды десек, ең ықтимал нәтиже қандай?', options: [{ label: 'A', text: 'Мұндай жағдай қоғамдық наразылықты туғызады' }, { label: 'B', text: 'Халық ештеңе істемейді' }, { label: 'C', text: 'Күнделікті өмір өзгермейді' }, { label: 'D', text: 'Азаматтар еңбекке мүлде тыйым салады' }], answer: 'A', explanation: 'Жерге, билікке және құқықтарға шабуыл ұлт-азаттық наразылық формасын туғызады.' },
  { question: 'Ресей империясының әскери бекіністері қандай себеппен салынды?', options: [{ label: 'A', text: 'Жергілікті тұрғындарды тыныш жағдайда ұстау' }, { label: 'B', text: 'Басқарудың әскери бақылауын күшейту' }, { label: 'C', text: 'Тек кино түсіру' }, { label: 'D', text: 'Ешқандай себеп жоқ' }], answer: 'B', explanation: 'Бекіністер әскери-әкімшілік бақылауды күшейтуге бағытталды.' },
  { question: 'Кенесары қазақ даласын біріктіруге ұмтылғанда, оның басты мотивациясы не болды?', options: [{ label: 'A', text: 'Тек байлық жинау' }, { label: 'B', text: 'Ұлттық дербестік және бірлік' }, { label: 'C', text: 'Саяхат жасау' }, { label: 'D', text: 'Ешқашан күрес жоқ' }], answer: 'B', explanation: 'Кенесарының күресі дербестік, күшті билік және ұлттың бірлігіне бағытталды.' },
  { question: 'Ресейдің әскери басымдылығы көтеріліс кезінде қандай рөл атқарды?', options: [{ label: 'A', text: 'Көтерілісті тез басып тастау' }, { label: 'B', text: 'Күреске тек көмектесті' }, { label: 'C', text: 'Әрқашан жеңілген жоқ' }, { label: 'D', text: 'Сайып келгенде ешқандай әсер етпеді' }], answer: 'A', explanation: 'Ресейдің әскери, әкімшілік және логистикалық мүмкіндіктері жеңісті қамтамасыз етті.' },
  { question: 'Көтерілістің тарихи маңызы неде?', options: [{ label: 'A', text: 'Тек іс жүзінде ұмытылды' }, { label: 'B', text: 'Ұлт-азаттық идеялар мен тарихи жадыны арттырды' }, { label: 'C', text: 'Тек сәуірде ғана еске алынады' }, { label: 'D', text: 'Әркімге қызық болмаса да өтті' }], answer: 'B', explanation: 'Көтеріліс ұлт-азаттық идеялардың, ұлттық сана-сезімнің және тарихи жадың дамуына ықпал етті.' },
]

const funFacts = [
  'Кенесары көтерілісі тек әскери оқиға емес, сонымен қатар саяси, әлеуметтік және идеологиялық күрес еді.',
  'Сырым Датұлы көтерілісі қазақ тарихындағы алғашқы аса ірі Ресейге қарсы қозғалыс ретінде қарастырылады.',
  'Ақмола бекінісі Ресейдің әкімшілік басып кіруін нығайтуда маңызды стратегиялық нүкте болды.',
  'Исатай мен Махамбет қозғалысы Оңтүстік және Орал өңірлерінде кең таралды.',
  'Көтерілістердің тарихи мәні бүгінгі ұлттық тарихта, білім беруде және қоғамдастықта сақталады.',
]

const initialGameResults: Record<GameKey, GameResult> = {
  quiz: { done: false, score: 0, correct: 0, wrong: 0, percent: 0 },
  matching: { done: false, score: 0, correct: 0, wrong: 0, percent: 0 },
  identity: { done: false, score: 0, correct: 0, wrong: 0, percent: 0 },
  order: { done: false, score: 0, correct: 0, wrong: 0, percent: 0 },
  detective: { done: false, score: 0, correct: 0, wrong: 0, percent: 0 },
}

const gameTabs = [
  { key: 'quiz', label: 'Тарихи викторина' },
  { key: 'matching', label: 'Даталарды сәйкестендір' },
  { key: 'identity', label: 'Тұлғаны таны' },
  { key: 'order', label: 'Оқиғаларды ретімен орналастыр' },
  { key: 'detective', label: 'Тарихи детектив' },
] as const

const videoLinks = [
  { title: 'Қазақ тарихы: Кенесары көтерілісі', description: 'Кенесары Қасымұлы көтерілісінің базалық тарихи мазмұны.', url: 'https://www.youtube.com/results?search_query=%D2%9B%D0%B0%D0%B7%D0%B0%D2%9B+%D1%82%D0%B0%D1%80%D0%B8%D1%85%D1%8B+%D0%9A%D0%B5%D0%BD%D0%B5%D1%81%D0%B0%D1%80%D1%8B+%D2%9B%D0%BE%D1%82%D0%B5%D1%80%D1%96%D1%81%D1%96' },
  { title: 'Исатай мен Махамбет: халықтық қозғалыс', description: 'Оңтүстік және Орал өңіріндегі ұлт-азаттық күрестің негізгі түсінігі.', url: 'https://www.youtube.com/results?search_query=%D0%98%D1%81%D0%B0%D1%82%D0%B0%D0%B9+%D0%BC%D0%B5%D0%BD+%D0%9C%D0%B0%D1%85%D0%B0%D0%BC%D0%B1%D0%B5%D1%82+%D2%9A%D0%B0%D0%B7%D0%B0%D2%9B+%D1%82%D0%B0%D1%80%D0%B8%D1%85%D1%8B' },
  { title: 'Ұлт-азаттық көтерілістер: XIX–XX ғасыр', description: 'Тарихи үрдістің әртүрлі кезеңдерінің салыстырмалы көрінісі.', url: 'https://www.youtube.com/results?search_query=%D2%B1%D0%BB%D1%82+%D0%B0%D0%B7%D0%B0%D1%82%D1%82%D1%8B%D2%9B+%D0%BA%D3%A9%D1%82%D0%B5%D1%80%D1%96%D0%BB%D1%96%D1%81%D1%82%D0%B5%D1%80' },
]

function App() {
  const { session, profile, isLoading: authLoading } = useAuth()
  const [darkMode, setDarkMode] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [activePage, setActivePage] = useState<PageId>(getPageFromHash)
  const [selectedEvent, setSelectedEvent] = useState(timelineData[0])
  const [selectedMap, setSelectedMap] = useState(mapLocations[0])
  const [factIndex, setFactIndex] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeGame, setActiveGame] = useState(0)
  const [showPracticeGames, setShowPracticeGames] = useState(false)
  const [matchingAnswers, setMatchingAnswers] = useState<Record<string, string>>({})
  const [matchingResult, setMatchingResult] = useState<{ correct: number; total: number; score: number } | null>(null)
  const [identitySelected, setIdentitySelected] = useState('')
  const [identityResult, setIdentityResult] = useState<{ correct: boolean; answer: string } | null>(null)
  const [orderItems, setOrderItems] = useState(eventOrderData)
  const [orderResult, setOrderResult] = useState<{ correct: number; total: number } | null>(null)
  const [detectiveSelections, setDetectiveSelections] = useState<Record<number, string>>({})
  const [detectiveResult, setDetectiveResult] = useState<{ correct: number; total: number } | null>(null)
  const [historyTutorMessages, setHistoryTutorMessages] = useState<ChatMessage[]>([])
  const [gameResults, setGameResults] = useState<Record<GameKey, GameResult>>(initialGameResults)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  useEffect(() => {
    const updateScrollState = () => {
      setIsScrolled(window.scrollY > 24)
      const art = document.querySelector<HTMLElement>('.hero-art')
      if (art && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        art.style.transform = `translate3d(0, ${Math.min(window.scrollY * 0.12, 90)}px, 0) scale(1.06)`
      }
    }
    updateScrollState()
    window.addEventListener('scroll', updateScrollState, { passive: true })
    return () => window.removeEventListener('scroll', updateScrollState)
  }, [])

  useEffect(() => {
    const targets = document.querySelectorAll<HTMLElement>('.editorial-section, .editorial-main-inner > section, .editorial-main-inner > div > section')
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      targets.forEach((target) => target.classList.add('is-visible'))
      return
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        }
      })
    }, { threshold: 0.12 })
    targets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
  }, [activePage])

  useEffect(() => {
    const syncPageFromLocation = () => {
      setActivePage(getPageFromHash())
      setMenuOpen(false)
    }
    window.addEventListener('hashchange', syncPageFromLocation)
    window.addEventListener('popstate', syncPageFromLocation)
    return () => {
      window.removeEventListener('hashchange', syncPageFromLocation)
      window.removeEventListener('popstate', syncPageFromLocation)
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  const navigateTo = (page: PageId) => {
    setActivePage(page)
    setMenuOpen(false)
    window.history.pushState(null, '', `#${page}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const accountMenuItems: { id: PageId; label: string }[] = session
    ? [
        { id: 'profile', label: 'Жеке кабинет' },
        ...(profile?.role === 'admin' ? [{ id: 'admin' as const, label: 'Әкімші панелі' }] : []),
      ]
    : []
  const menuItems = [...navItems, ...accountMenuItems]
  const desktopAccountItems: { id: PageId; label: string }[] = session
    ? [
        { id: 'profile', label: 'Кабинет' },
        ...(profile?.role === 'admin' ? [{ id: 'admin' as const, label: 'Әкімші' }] : []),
      ]
    : []

  const filteredGlossary = useMemo(() => {
    const value = searchTerm.trim().toLowerCase()
    if (!value) return glossary
    return glossary.filter((item) => item.term.toLowerCase().includes(value) || item.definition.toLowerCase().includes(value) || item.example.toLowerCase().includes(value))
  }, [searchTerm])

  const doneGames = Object.values(gameResults).filter((result) => result.done).length
  const totalScore = Object.values(gameResults).reduce((sum, item) => sum + item.score, 0)
  const overallPercent = doneGames === 0 ? 0 : Math.round(Object.values(gameResults).reduce((sum, item) => sum + item.percent, 0) / doneGames)
  const finalLevel = overallPercent >= 85 ? 'Үздік' : overallPercent >= 70 ? 'Жоғары' : overallPercent >= 45 ? 'Орташа' : 'Бастапқы'
  const allGamesDone = doneGames === gameTabs.length

  const cycleFact = () => setFactIndex((prev) => (prev + 1) % funFacts.length)

  const handleMatchingSubmit = () => {
    const correctCount = matchingPairs.filter((pair) => matchingAnswers[pair.id] === pair.value).length
    const finalScore = correctCount * 20
    setMatchingResult({ correct: correctCount, total: matchingPairs.length, score: finalScore })
    setGameResults((prev) => ({
      ...prev,
      matching: { done: true, score: finalScore, correct: correctCount, wrong: matchingPairs.length - correctCount, percent: Math.round((correctCount / matchingPairs.length) * 100) },
    }))
  }

  const handleIdentitySubmit = () => {
    const answer = identitySelected || 'Кенесары Қасымұлы'
    const isCorrect = answer === 'Кенесары Қасымұлы'
    const score = isCorrect ? 20 : 0
    setIdentityResult({ correct: isCorrect, answer })
    setGameResults((prev) => ({
      ...prev,
      identity: { done: true, score, correct: isCorrect ? 1 : 0, wrong: isCorrect ? 0 : 1, percent: isCorrect ? 100 : 0 },
    }))
  }

  const moveOrderItem = (index: number, direction: 'up' | 'down') => {
    setOrderItems((prev) => {
      const next = [...prev]
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= next.length) return prev
      ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
      return next
    })
  }

  const handleOrderSubmit = () => {
    const correct = eventOrderData.filter((item, index) => orderItems[index] === item).length
    const score = correct * 25
    setOrderResult({ correct, total: eventOrderData.length })
    setGameResults((prev) => ({
      ...prev,
      order: { done: true, score, correct, wrong: eventOrderData.length - correct, percent: Math.round((correct / eventOrderData.length) * 100) },
    }))
  }

  const handleDetectiveSubmit = () => {
    let correct = 0
    for (const index of Object.keys(detectiveCases)) {
      const itemIndex = Number(index)
      if (detectiveSelections[itemIndex] === detectiveCases[itemIndex].answer) correct += 1
    }
    setDetectiveResult({ correct, total: detectiveCases.length })
    setGameResults((prev) => ({
      ...prev,
      detective: { done: true, score: correct * 20, correct, wrong: detectiveCases.length - correct, percent: Math.round((correct / detectiveCases.length) * 100) },
    }))
  }

  const resetMatching = () => {
    setMatchingAnswers({})
    setMatchingResult(null)
    setGameResults((prev) => ({ ...prev, matching: { done: false, score: 0, correct: 0, wrong: 0, percent: 0 } }))
  }

  const resetIdentity = () => {
    setIdentitySelected('')
    setIdentityResult(null)
    setGameResults((prev) => ({ ...prev, identity: { done: false, score: 0, correct: 0, wrong: 0, percent: 0 } }))
  }

  const resetOrder = () => {
    setOrderItems(eventOrderData)
    setOrderResult(null)
    setGameResults((prev) => ({ ...prev, order: { done: false, score: 0, correct: 0, wrong: 0, percent: 0 } }))
  }

  const resetDetective = () => {
    setDetectiveSelections({})
    setDetectiveResult(null)
    setGameResults((prev) => ({ ...prev, detective: { done: false, score: 0, correct: 0, wrong: 0, percent: 0 } }))
  }

  const resetAllGames = () => {
    resetMatching(); resetIdentity(); resetOrder(); resetDetective()
  }

  const renderGamePanel = () => {
    const key = gameTabs[activeGame]?.key

    if (key === 'quiz') {
      return (
        <VerifiedQuiz key={session?.user.id ?? 'signed-out'} onCompleted={(result) => setGameResults((previous) => ({
          ...previous,
          quiz: {
            done: true,
            score: result.score,
            correct: result.correct_count,
            wrong: result.question_count - result.correct_count,
            percent: Math.round(result.correct_count / result.question_count * 100),
          },
        }))} />
      )
    }

    if (key === 'matching') {
      return (
        <div className="space-y-5">
          <div className="grid gap-4">
            {matchingPairs.map((pair) => (
              <div key={pair.id} className="grid gap-3 rounded-2xl border border-slate-700 bg-slate-900/60 p-4 md:grid-cols-[1.4fr_0.8fr] md:items-center">
                <p className="text-slate-100">{pair.label}</p>
                <select value={matchingAnswers[pair.id] ?? ''} onChange={(event) => setMatchingAnswers((prev) => ({ ...prev, [pair.id]: event.target.value }))} className="rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100">
                  <option value="">Жылды таңдаңыз</option>
                  {matchingPairs.map((item) => <option key={item.value} value={item.value}>{item.value}</option>)}
                </select>
              </div>
            ))}
          </div>
          <button type="button" onClick={handleMatchingSubmit} className="rounded-full bg-sky-500 px-5 py-3 font-medium text-white">Нәтижені тексеру</button>
          {matchingResult && <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-100"><p className="text-lg font-semibold">Дұрыс жауаптар: {matchingResult.correct}/{matchingResult.total}</p><p>Ұпай: {matchingResult.score}</p></div>}
        </div>
      )
    }

    if (key === 'identity') {
      return (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">3 сипаттама</p>
            <ol className="mt-3 space-y-2 text-slate-100">
              {identityCards[0].descriptors.map((descriptor) => <li key={descriptor} className="list-decimal pl-5">{descriptor}</li>)}
            </ol>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {['Кенесары Қасымұлы', 'Сырым Датұлы', 'Махамбет Өтемісұлы'].map((person) => (
              <button key={person} type="button" onClick={() => setIdentitySelected(person)} className={`rounded-2xl border p-4 text-left transition ${identitySelected === person ? 'border-amber-400 bg-amber-500/10 text-amber-100' : 'border-slate-700 bg-slate-900/50 text-slate-200'}`}>
                {person}
              </button>
            ))}
          </div>
          <button type="button" onClick={handleIdentitySubmit} className="rounded-full bg-amber-400 px-5 py-3 font-medium text-slate-900">Жауапты тексеру</button>
          {identityResult && <div className={`rounded-2xl border p-4 ${identityResult.correct ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100' : 'border-rose-500/40 bg-rose-500/10 text-rose-100'}`}>{identityResult.correct ? 'Дұрыс! Кенесары Қасымұлы' : 'Қате, дұрыс жауап: Кенесары Қасымұлы'}</div>}
        </div>
      )
    }

    if (key === 'order') {
      return (
        <div className="space-y-4">
          <p className="text-slate-200">Көтеріліс кезеңдерін дұрыс ретпен орналастырыңыз.</p>
          <div className="space-y-3">
            {orderItems.map((item, index) => (
              <div key={`${item}-${index}`} className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-900/60 p-3">
                <span className="text-slate-100">{index + 1}. {item}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => moveOrderItem(index, 'up')} className="rounded-full bg-slate-800 px-3 py-1 text-sm text-white">Жоғары</button>
                  <button type="button" onClick={() => moveOrderItem(index, 'down')} className="rounded-full bg-slate-800 px-3 py-1 text-sm text-white">Төмен</button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={handleOrderSubmit} className="rounded-full bg-sky-500 px-5 py-3 font-medium text-white">Тексеру</button>
          {orderResult && <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-100">Дұрыс жауаптар: {orderResult.correct}/{orderResult.total}</div>}
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {detectiveCases.map((caseItem, index) => (
          <div key={caseItem.question} className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
            <p className="mb-3 text-slate-100">{index + 1}. {caseItem.question}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {caseItem.options.map((option) => (
                <button key={option.label} type="button" onClick={() => setDetectiveSelections((prev) => ({ ...prev, [index]: option.label }))} className={`rounded-xl border p-3 text-left ${detectiveSelections[index] === option.label ? 'border-amber-400 bg-amber-500/10 text-amber-100' : 'border-slate-700 bg-slate-950 text-slate-200'}`}>
                  {option.label}. {option.text}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button type="button" onClick={handleDetectiveSubmit} className="rounded-full bg-violet-500 px-5 py-3 font-medium text-white">Нәтиже көрсет</button>
        {detectiveResult && <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-100">Дұрыс жауаптар: {detectiveResult.correct}/{detectiveResult.total}</div>}
      </div>
    )
  }

  return (
    <div className={`editorial-site ${darkMode ? 'dark' : ''} ${activePage === 'home' ? 'is-home' : 'is-inner-page'}`}>
      <div className="editorial-shell">
        <header className={`site-header ${activePage === 'home' && !isScrolled ? 'header-over-hero' : 'header-solid'}`}>
          <div className="site-header-inner">
            <button type="button" className="wordmark" onClick={() => navigateTo('home')} aria-label="АЗАТТЫҚ — басты бет">
              <span className="wordmark-title">АЗАТТЫҚ</span>
              <span className="wordmark-subtitle">KAZAKH HISTORY</span>
            </button>
            <nav className="desktop-nav" aria-label="Негізгі навигация">
              {primaryNav.map((item, index) => <button key={`${item.label}-${index}`} type="button" onClick={() => navigateTo(item.id)} className={activePage === item.id ? 'nav-link nav-link-active' : 'nav-link'}>{item.label}</button>)}
            </nav>
            {desktopAccountItems.length > 0 && <nav className="desktop-account-nav" aria-label="Аккаунт">
              {desktopAccountItems.map((item) => <button key={item.id} type="button" onClick={() => navigateTo(item.id)} className={activePage === item.id ? 'nav-link nav-link-active' : 'nav-link'}>{item.label}</button>)}
            </nav>}
            <div className="header-actions">
              <button type="button" onClick={() => setDarkMode((prev) => !prev)} className="theme-toggle" aria-label="Түстер режимін ауыстыру">{darkMode ? <SunMedium size={17} /> : <Moon size={17} />}</button>
              <button type="button" onClick={() => setMenuOpen((prev) => !prev)} className={`menu-toggle ${menuOpen ? 'menu-toggle-open' : ''}`} aria-label={menuOpen ? 'Мәзірді жабу' : 'Мәзірді ашу'} aria-expanded={menuOpen}><span>{menuOpen ? 'Жабу' : 'Мәзір'}</span>{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
            </div>
          </div>
          {menuOpen && <div className="menu-overlay">
            <div className="menu-overlay-inner">
              <p className="menu-kicker">ТАРИХТЫҢ ІЗІМЕН</p>
              <div className="menu-link-list">{menuItems.map((item, index) => <button key={`${item.id}-${item.label}`} type="button" onClick={() => navigateTo(item.id)} className={activePage === item.id ? 'menu-page-link menu-page-link-active' : 'menu-page-link'}><span className="menu-page-number">0{index + 1}</span><span>{item.label}</span><ArrowRight size={19} /></button>)}</div>
              <button type="button" onClick={() => setDarkMode((prev) => !prev)} className="menu-theme-toggle" aria-pressed={darkMode}><span>{darkMode ? 'Жарық тақырыпқа ауысу' : 'Қараңғы тақырыпқа ауысу'}</span>{darkMode ? <SunMedium size={18} /> : <Moon size={18} />}</button>
              <div className="menu-footnote"><span>ҚАЗАҚ ДАЛАСЫ</span><span>1783 — 1916</span></div>
            </div>
          </div>}
        </header>

        <main className={`editorial-main ${activePage === 'home' ? 'editorial-main-home' : 'editorial-main-inner'}`}>
          {activePage === 'home' && (
          <div className="home-story">
          <section id="home" className="hero-scene">
            <img className="hero-art" src={heroPhoto} alt="Қазақ даласындағы аттылы көрініс" fetchPriority="high" />
            <div className="hero-shade" />
            <div className="hero-meta hero-meta-top"><span>ЦИФРЛЫҚ ТАРИХИ ЗЕРТТЕУ</span><span>01 / 04</span></div>
            <div className="hero-copy">
              <p className="hero-eyebrow"><span /> ТАРИХТЫҢ ІЗІМЕН</p>
              <h1>АЗАТТЫҚ</h1>
              <p className="hero-subtitle">Қазақ даласындағы<br />ұлт-азаттық көтерілістер</p>
              <p className="hero-intro">Жер мен дербестік үшін күрестің ізін төрт тарихи кезең арқылы зерттеңіз.</p>
              <div className="hero-actions">
                <button type="button" onClick={() => navigateTo('timeline')} className="hero-primary-link">Тарихты зерттеу <ArrowRight size={17} /></button>
                <button type="button" onClick={() => navigateTo('timeline')} className="hero-text-link">Хронологияға өту</button>
              </div>
            </div>
            <div className="hero-period"><span>ҚАРСЫЛЫҚТЫҢ ҒАСЫРЛАРЫ</span><strong>1783 <i>—</i> 1916</strong></div>
            <button type="button" className="hero-scroll" onClick={() => document.getElementById('story-intro')?.scrollIntoView({ behavior: 'smooth' })}><span>ТӨМЕН ЖЫЛЖЫТЫҢЫЗ</span><i /></button>
            <span className="hero-art-credit">ҚАЗАҚ ДАЛАСЫНДАҒЫ АТТЫЛЫ КӨРІНІС</span>
          </section>

          <section id="story-intro" className="story-intro editorial-section">
            <div className="section-index">I <span>КІРІСПЕ</span></div>
            <div className="story-intro-copy">
              <p className="eyebrow">ЖЕР. ЕРКІНДІК. ДЕРБЕСТІК.</p>
              <h2>Тарих өзінен<br /><em>басталады.</em></h2>
              <p>Қазақ даласындағы азаттық қозғалыстар бір күнде туған жоқ. Жерге, елдікке және саяси дербестікке қатысты шешімдер бірнеше ұрпақтың жадында із қалдырды.</p>
              <button type="button" className="editorial-link" onClick={() => navigateTo('knowledge')}>Тарихи контексті оқу <ArrowRight size={16} /></button>
              <button type="button" className="historical-note" onClick={cycleFact}><span>ТАРИХИ ДЕРЕК · КЕЛЕСІСІН КӨРУ</span><p>{funFacts[factIndex]}</p><ArrowRight size={15} /></button>
            </div>
            <figure className="intro-figure">
              <img src={steppeArtwork} alt="Таңғы тұман басқан кең дала — көркемдік реконструкция" loading="lazy" />
              <figcaption><span>ДАЛА КЕҢІСТІГІ</span><span>Көркемдік реконструкция, нақты архивтік фото емес</span></figcaption>
            </figure>
            <div className="story-side-note">БІР ДАЛА.<br />КӨП ДАУЫС.</div>
          </section>

          <section className="era-section editorial-section">
            <div className="section-heading">
              <div><p className="eyebrow">1783 — 1916 · ТАРИХИ ШОЛУ</p><h2>Бір ғасыр.<br /><em>Бірнеше көтеріліс.</em></h2></div>
              <p className="section-deck">Әр көтеріліс өз уақытының талабынан туды. Төрт кезең — бір кең тарихи әңгіме.</p>
            </div>
            <div className="era-grid">{[timelineData[0], timelineData[3], timelineData[4], timelineData[9]].map((event, index) => <button key={event.year} type="button" className={`era-card era-card-${index + 1}`} onClick={() => { setSelectedEvent(event); navigateTo('timeline') }}><span className="era-image" style={{ backgroundImage: `url(${steppeArtwork})` }}><span className="era-image-index">0{index + 1}</span><span className="era-image-label">КӨРКЕМДІК БЕЙНЕ</span></span><span className="era-date">{event.year}</span><span className="era-title">{['Сырым Датұлы', 'Исатай мен Махамбет', 'Кенесары Қасымұлы', '1916 жылғы көтеріліс'][index]}</span><span className="era-description">{event.description}</span><span className="era-open">ТАРИХҚА ӨТУ <ArrowRight size={14} /></span></button>)}</div>
            <button type="button" className="editorial-link era-all-link" onClick={() => navigateTo('timeline')}>Толық хронология <ArrowRight size={16} /></button>
          </section>

          <section className="kenesary-feature editorial-section">
            <div className="kenesary-image" role="img" aria-label="Көркемдік реконструкция: Сарыарқадағы атты жасақтар" style={{ backgroundImage: `url(${steppeArtwork})` }}><span>КӨРКЕМДІК РЕКОНСТРУКЦИЯ</span></div>
            <div className="kenesary-copy"><p className="eyebrow">1837 — 1847 · НЕГІЗГІ ТАРАУ</p><span className="kenesary-number">10</span><p className="kenesary-number-caption">ЖЫЛҒА СОЗЫЛҒАН КҮРЕС</p><h2>Он жылдық<br /><em>қарсылық.</em></h2><p>Кенесары Қасымұлы бастаған қозғалыс қазақ даласының кең аумағын қамтыған саяси әрі әскери күрес болды. Оның жолы келіссөзден қарулы қақтығысқа, Сарыарқадан оңтүстікке қарай жылжыды.</p><button type="button" className="editorial-link" onClick={() => navigateTo('study')}>Тарауды зерттеу <ArrowRight size={16} /></button></div>
          </section>

          <section className="people-preview editorial-section">
            <div className="section-heading"><div><p className="eyebrow">ҚОЗҒАЛЫСТЫҢ ЖҮЗДЕРІ</p><h2>Тұлғалар.<br /><em>Тарихи іздер.</em></h2></div><button type="button" className="editorial-link" onClick={() => navigateTo('knowledge')}>10 тұлғаның барлығы <ArrowRight size={16} /></button></div>
            <div className="people-editorial-grid">{[personalities[0], personalities[6], personalities[7], personalities[8]].map((person, index) => <button type="button" className={`people-editorial-item people-editorial-item-${index + 1}`} key={person.name} onClick={() => navigateTo('knowledge')}><span className={`portrait-etching portrait-etching-${index + 1}`} aria-hidden="true"><span /></span><span className="portrait-disclaimer">ШАРТТЫ КӨРКЕМДІК СИЛУЭТ</span><span className="people-editorial-name">{person.name}</span><span className="people-editorial-years">{person.years}</span></button>)}</div>
          </section>

          <section className="final-challenge editorial-section">
            <div><p className="eyebrow">КЕЛЕСІ ҚАДАМ</p><h2>Пікіріңмен бөліс.<br /><em>Тарихты зертте.</em></h2><p>10 сұраққа жауап беріп, зерттеуге қатысыңыз. Сауалнаманың мақсаты — кемінде 100 нақты респондент жинау.</p></div>
            <div className="challenge-progress"><span className="challenge-progress-label">САУАЛНАМА МАҚСАТЫ</span><strong>100<i>+ адам</i></strong><button type="button" className="hero-primary-link" onClick={() => navigateTo('games')}>Сауалнамаға өту <ArrowRight size={17} /></button></div>
          </section>
          </div>
          )}

          {activePage === 'map' && (
          <section id="map" className="rounded-[28px] border border-white/10 bg-slate-900/80 p-5 md:p-8">
            <div className="mb-6 flex items-center gap-3"><MapPinned className="text-amber-300" /><div><p className="text-xs uppercase tracking-[0.25em] text-slate-400">Тарихи карта</p><h2 className="text-3xl font-bold text-white">Көтерілістердің негізгі аймақтары</h2><p className="mt-2 text-sm text-slate-400">1836–1847 жылдардағы қозғалыстар мен Кенесары жасағының оңтүстікке қарай жылжуы</p></div></div>
            <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
              <div className="history-map-frame">
                <div className="history-map">
                  <svg className="history-map-art" viewBox="0 0 800 440" role="img" aria-labelledby="history-map-title history-map-description">
                    <title id="history-map-title">Қазақстандағы көтерілістердің негізгі аймақтары</title>
                    <desc id="history-map-description">Қазіргі Қазақстанның сұлбасы көрсетілген схемалық карта. Белгілерді таңдап, көтерілістер өткен өңірлер туралы оқыңыз.</desc>
                    <defs>
                      <linearGradient id="land-fill" x1="0" x2="1" y1="0" y2="1">
                        <stop offset="0%" stopColor="#756448" />
                        <stop offset="55%" stopColor="#60523d" />
                        <stop offset="100%" stopColor="#8a7050" />
                      </linearGradient>
                      <pattern id="map-grain" width="22" height="22" patternUnits="userSpaceOnUse">
                        <circle cx="3" cy="4" r="0.8" fill="#d7c08a" opacity="0.12" />
                        <circle cx="16" cy="14" r="0.6" fill="#d7c08a" opacity="0.1" />
                      </pattern>
                    </defs>
                    <path className="map-water" d="M0 0H800V440H0Z" />
                    <path className="map-sea" d="M0 163C33 151 62 161 82 183 98 201 99 226 88 247 77 269 55 285 34 287L0 280Z" />
                    <path className="map-sea map-aral-sea" d="M266 349C279 341 302 342 316 350 308 359 286 362 270 357Z" />
                    <path className="map-land" d="M93 151L116 143 123 128 151 120 170 103 203 106 232 94 269 101 298 91 329 102 360 96 391 108 423 99 455 104 486 94 516 103 540 98 568 110 599 108 625 120 650 117 678 132 706 143 724 163 711 184 724 203 709 220 714 244 696 262 700 284 679 298 662 318 635 324 613 341 586 332 565 347 540 337 516 351 488 342 463 355 439 342 410 350 385 337 354 344 332 326 302 334 281 317 256 322 238 305 215 303 198 284 176 281 164 263 144 253 136 232 119 219 113 199 96 188 105 171Z" />
                    <path className="map-grain-overlay" d="M93 151L116 143 123 128 151 120 170 103 203 106 232 94 269 101 298 91 329 102 360 96 391 108 423 99 455 104 486 94 516 103 540 98 568 110 599 108 625 120 650 117 678 132 706 143 724 163 711 184 724 203 709 220 714 244 696 262 700 284 679 298 662 318 635 324 613 341 586 332 565 347 540 337 516 351 488 342 463 355 439 342 410 350 385 337 354 344 332 326 302 334 281 317 256 322 238 305 215 303 198 284 176 281 164 263 144 253 136 232 119 219 113 199 96 188 105 171Z" />
                    <path className="map-border-detail" d="M93 151L116 143 123 128 151 120 170 103 203 106 232 94 269 101 298 91 329 102 360 96 391 108 423 99 455 104 486 94 516 103 540 98 568 110 599 108 625 120 650 117 678 132 706 143 724 163 711 184 724 203 709 220 714 244 696 262 700 284 679 298 662 318 635 324 613 341 586 332 565 347 540 337 516 351 488 342 463 355 439 342 410 350 385 337 354 344 332 326 302 334 281 317 256 322 238 305 215 303 198 284 176 281 164 263 144 253 136 232 119 219 113 199 96 188 105 171Z" />
                    <path className="map-region-line" d="M178 117L194 171 182 224 207 278M259 101L272 156 252 206 267 258 281 317M344 101L350 151 333 204 354 258 354 344M430 102L422 154 440 202 421 251 439 342M520 104L507 153 528 203 514 253 516 351M611 115L594 162 616 205 595 257 613 341M150 205L224 190 300 196 375 186 450 197 530 189 605 198 714 203M164 263L239 252 318 264 397 251 474 264 549 252 626 267 696 262" />
                    <path className="map-river" d="M166 144C191 168 161 195 184 218S195 260 220 275M338 134C362 157 337 183 360 203S371 245 393 263" />
                    <path className="map-route" d="M458 145C476 162 480 177 480 194S447 231 443 251S462 282 498 300S536 322 555 337" />
                    <text className="map-water-label" x="63" y="295">Каспий теңізі</text>
                    <text className="map-water-label" x="259" y="365">Арал теңізі</text>
                    <text className="map-neighbor-label" x="398" y="68">РЕСЕЙ</text>
                    <text className="map-neighbor-label" x="746" y="242" transform="rotate(90 746 242)">ҚЫТАЙ</text>
                    <text className="map-neighbor-label" x="493" y="393">ҚЫРҒЫЗСТАН</text>
                    <text className="map-neighbor-label" x="350" y="396">ӨЗБЕКСТАН</text>
                    <text className="map-region-label" x="244" y="174">БАТЫС ҚАЗАҚСТАН</text>
                    <text className="map-region-label" x="444" y="124">САРЫАРҚА</text>
                    <text className="map-region-label" x="560" y="231">ЖЕТІСУ</text>
                    <text className="map-compass" x="757" y="59">N ↑</text>
                    <path className="map-scale" d="M48 392H108M48 387V397M108 387V397" />
                    <text className="map-scale-label" x="48" y="411">шамамен 500 км</text>
                  </svg>
                  {mapLocations.map((item, index) => <button key={item.name} type="button" onClick={() => setSelectedMap(item)} className={`map-dot ${selectedMap.name === item.name ? 'map-dot-selected' : ''}`} style={{ left: item.left, top: item.top }} aria-label={`${index + 1}. ${item.name}, ${item.period}`} aria-pressed={selectedMap.name === item.name}><span>{index + 1}</span></button>)}
                  <div className="map-caption"><span className="map-caption-dot" /> Көтеріліс өткен аймақ</div>
                </div>
                <p className="history-map-note">Схемалық карта: шекаралар қазіргі Қазақстан аумағын бағдар ретінде көрсетеді; тарихи оқиғалардың орны мен қозғалыс бағыты шамамен белгіленген.</p>
              </div>
              <div className="flex flex-col gap-4">
                <div className="rounded-[24px] border border-amber-400/20 bg-slate-950/60 p-5">
                  <p className="text-xs uppercase tracking-[0.25em] text-amber-300">Таңдалған өңір · {mapLocations.findIndex((item) => item.name === selectedMap.name) + 1}</p>
                  <h3 className="mt-3 text-2xl font-bold text-white">{selectedMap.name}</h3>
                  <div className="mt-3 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">{selectedMap.period}</div>
                  <p className="mt-5 leading-7 text-slate-200">{selectedMap.description}</p>
                  <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-900/60 p-4"><p className="text-sm uppercase tracking-[0.2em] text-slate-400">Қозғалыс жетекшілері</p><p className="mt-2 text-slate-100">{selectedMap.people}</p></div>
                </div>
                <div className="rounded-[24px] border border-slate-700 bg-slate-950/50 p-4">
                  <p className="mb-3 text-xs uppercase tracking-[0.2em] text-slate-400">Картадан өңірді таңдаңыз</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                    {mapLocations.map((item, index) => <button key={item.name} type="button" onClick={() => setSelectedMap(item)} className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${selectedMap.name === item.name ? 'border-amber-400/60 bg-amber-400/10 text-amber-100' : 'border-slate-700/80 bg-slate-900/50 text-slate-300 hover:border-slate-500'}`} aria-pressed={selectedMap.name === item.name}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${selectedMap.name === item.name ? 'bg-amber-300 text-slate-950' : 'bg-slate-800 text-amber-200'}`}>{index + 1}</span><span className="min-w-0"><span className="block truncate text-sm font-medium">{item.name}</span><span className="text-xs text-slate-400">{item.period}</span></span></button>)}
                  </div>
                </div>
              </div>
            </div>
          </section>
          )}

          {activePage === 'timeline' && (
          <section id="timeline" className="rounded-[28px] border border-white/10 bg-slate-900/80 p-5 md:p-8">
            <div className="mb-6 flex items-center gap-3"><Clock3 className="text-amber-300" /><div><p className="text-xs uppercase tracking-[0.25em] text-slate-400">Хронология</p><h2 className="text-3xl font-bold text-white">1783–1916</h2></div></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{timelineData.map((event) => <button key={event.year} type="button" onClick={() => setSelectedEvent(event)} className={`timeline-card rounded-[22px] p-5 text-left transition hover:border-amber-400/50 ${selectedEvent.year === event.year ? 'border-amber-400/60 bg-amber-500/10' : ''}`}><div className="mb-3 text-sm font-medium text-amber-300">{event.year}</div><h3 className="text-xl font-semibold text-white">{event.title}</h3><p className="mt-3 text-sm leading-6 text-slate-300">{event.description}</p></button>)}</div>
            <div className="mt-6 rounded-[24px] border border-amber-400/20 bg-gradient-to-r from-amber-500/10 to-sky-500/10 p-5"><div className="text-xs uppercase tracking-[0.25em] text-amber-300">Таңдалған оқиға</div><h3 className="mt-3 text-2xl font-bold text-white">{selectedEvent.title}</h3><div className="mt-2 text-sm text-amber-200">{selectedEvent.year}</div><p className="mt-4 max-w-3xl text-slate-200">{selectedEvent.description}</p></div>
          </section>
          )}

          {activePage === 'knowledge' && <div className="space-y-8">
          <section id="theses" className="rounded-[28px] border border-white/10 bg-slate-900/80 p-5 md:p-8">
            <div className="mb-6 flex items-center gap-3"><BookOpenText className="text-amber-300" /><div><p className="text-xs uppercase tracking-[0.25em] text-slate-400">10 негізгі тезис</p><h2 className="text-3xl font-bold text-white">Көтерілістердің мәні</h2></div></div>
            <div className="grid gap-4 lg:grid-cols-2">{theses.map((item) => <article key={item.title} className="rounded-[22px] border border-slate-700 bg-slate-950/50 p-5"><h3 className="text-lg font-semibold text-white">{item.title}</h3><p className="mt-3 text-slate-200">{item.explanation}</p><div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-100">{item.example}</div></article>)}</div>
          </section>

          <section id="facts" className="rounded-[28px] border border-white/10 bg-slate-900/80 p-5 md:p-8">
            <div className="mb-6 flex items-center gap-3"><Trophy className="text-amber-300" /><div><p className="text-xs uppercase tracking-[0.25em] text-slate-400">30 тарихи факт</p><h2 className="text-3xl font-bold text-white">Себептер, оқиғалар, нәтиже</h2></div></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{facts.map((fact, index) => <article key={`${fact.title}-${index}`} className="rounded-[22px] border border-slate-700 bg-slate-950/50 p-4"><div className="mb-2 text-xs uppercase tracking-[0.25em] text-amber-300">{fact.category}</div><h3 className="text-lg font-semibold text-white">{index + 1}. {fact.title}</h3><div className="mt-2 text-sm text-amber-200">{fact.date}</div><p className="mt-2 text-sm leading-6 text-slate-300">{fact.description}</p></article>)}</div>
          </section>

          <section id="people" className="rounded-[28px] border border-white/10 bg-slate-900/80 p-5 md:p-8">
            <div className="mb-6 flex items-center gap-3"><Users className="text-amber-300" /><div><p className="text-xs uppercase tracking-[0.25em] text-slate-400">10 тарихи тұлға</p><h2 className="text-3xl font-bold text-white">Қозғалыстың жетекшілері</h2></div></div>
            <div className="people-archive-grid">{personalities.map((person, index) => <article key={person.name} className={`person-archive-card person-archive-card-${index + 1}`}><div className={`portrait-etching portrait-etching-${index % 4 + 1}`} aria-hidden="true"><span /></div><p className="portrait-disclaimer">ШАРТТЫ КӨРКЕМДІК СИЛУЭТ · НАҚТЫ ПОРТРЕТ ЕМЕС</p><h3>{person.name}</h3><p className="person-years">{person.years}</p><p className="person-role">{person.role}</p><p className="person-movement">{person.movement}</p><p className="person-description">{person.description}</p></article>)}</div>
          </section>
          </div>}

          {activePage === 'study' && <div className="space-y-8">
          <section id="study" className="rounded-[28px] border border-white/10 bg-slate-900/80 p-5 md:p-8">
            <div className="mb-6 flex items-center gap-3"><BrainCircuit className="text-amber-300" /><div><p className="text-xs uppercase tracking-[0.25em] text-slate-400">Оқу материалдары</p><h2 className="text-3xl font-bold text-white">Кенесары көтерілісін түсіну</h2></div></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{['Көтерілістің алғышарттары', 'Негізгі себептері', 'Қозғаушы күштері', 'Көтерілістің басталуы', 'Негізгі кезеңдері', 'Маңызды шайқастар', 'Кенесарының саяси мақсаттары', 'Жеңіліс себептері', 'Нәтижелері және салдары', 'Тарихи маңызы'].map((topic, index) => <div key={topic} className="rounded-[20px] border border-slate-700 bg-slate-950/50 p-4"><div className="mb-2 text-sm font-medium text-amber-300">{index + 1}</div><h3 className="text-lg font-semibold text-white">{topic}</h3><p className="mt-2 text-sm leading-6 text-slate-300">{index === 0 && 'Ресейдің отарлау саясаты, жер мәселесі, әкімшілік қысым, дін мен ұлттық сана-сезімнің сабақтастығы.'}{index === 1 && 'Қазақ қоғамының экономикалық, әскери және саяси қысымы көтеріліс үшін жағдай жасады.'}{index === 2 && 'Батырлар, би-шешендер, жергілікті қауымдар және хан жағдауына негізделген күштер.'}{index === 3 && '1837 жылы Кенесарының бастамасымен қозғалыс кең ауқымды әлеуметтік және әскери сипат алды.'}{index === 4 && 'Бастапқы жайылған шағын тізбектен, кең көлемді әскери және саяси дағдарысқа дейін.'}{index === 5 && 'Ақмола, Көкшетау, Ұлытау, Жетісу мен Жайық маңындағы шайқастардың рөлі.'}{index === 6 && 'Кенесарының жаңа билік құрғысы, дербестік, жанұяның әрі қарай нығайтуы.'}{index === 7 && 'Ресейдің әскери, әр түрлі қару-жарақ, шектеулі логистика және сыртқы саяси қысым.'}{index === 8 && 'Қоғамдық құбылыстар, саясаттағы салдар, кейінгі тарихта өткен сабақтар.'}{index === 9 && 'Ұлт-азаттық идеялар, тарихтың сабақтастығы, бүгінгі Қазақстан үшін маңызы.'}</p></div>)}</div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-slate-900/80 p-5 md:p-8">
            <div className="mb-6 flex items-center gap-3"><Globe className="text-amber-300" /><div><p className="text-xs uppercase tracking-[0.25em] text-slate-400">Бейнематериалдар</p><h2 className="text-3xl font-bold text-white">YouTube-тағы дереккөздер</h2></div></div>
            <div className="grid gap-4 lg:grid-cols-3">{videoLinks.map((video) => <div key={video.title} className="rounded-[22px] border border-slate-700 bg-slate-950/60 p-4"><div className="mb-3 flex h-36 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-sky-500/20 text-amber-200"><Play size={28} /></div><h3 className="text-xl font-semibold text-white">{video.title}</h3><p className="mt-2 text-sm leading-6 text-slate-300">{video.description}</p><a href={video.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-amber-300">Қарау <ArrowRight size={16} /></a></div>)}</div>
          </section>
          </div>}

          {activePage === 'games' && (
          <section id="games" className="survey-page">
            <SurveyExperience />
            <div className="survey-practice-toggle">
              <div><p className="survey-kicker">ҚОСЫМША БӨЛІМ</p><h2>Тарихи ойын жаттығулары</h2><p>Бұрынғы викторина мен төрт жаттығу осы жерде сақталған.</p></div>
              <button type="button" className="survey-submit" aria-expanded={showPracticeGames} onClick={() => setShowPracticeGames((visible) => !visible)}>{showPracticeGames ? 'Жаттығуларды жасыру' : 'Жаттығуларды ашу'} <ArrowRight size={17} /></button>
            </div>
            {showPracticeGames && (
              <div className="survey-practice-content">
                <p className="survey-practice-note">Тарихи викторинаның ұпайы серверде тексеріліп, профиліңізге сақталады. Қалған төрт шағын ойын осы сессияға арналған жаттығулар; олардың ұпайы рейтингке қосылмайды.</p>
                <div className="mb-5 flex flex-wrap gap-2">{gameTabs.map((game, index) => <button key={game.key} type="button" onClick={() => setActiveGame(index)} className={`rounded-full px-4 py-2 text-sm font-medium transition ${activeGame === index ? 'bg-amber-400 text-slate-900' : 'border border-slate-700 bg-slate-950 text-slate-200'}`}>{game.label}</button>)}</div>
                <div className="rounded-[24px] border border-slate-700 bg-slate-950/60 p-5">{renderGamePanel()}</div>
                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">{gameTabs.map((game) => { const result = gameResults[game.key]; return <div key={game.key} className="rounded-[18px] border border-slate-700 bg-slate-950/50 p-4"><p className="text-xs uppercase tracking-[0.2em] text-slate-400">{game.label}</p><p className="mt-2 text-xl font-bold text-white">{result.score} {game.key === 'quiz' ? 'серверлік ұпай' : 'жаттығу ұпайы'}</p><p className="text-sm text-slate-300">{result.done ? 'Аяқталды' : 'Орындалмады'}</p></div>})}</div>
              </div>
            )}
          </section>
          )}

          {activePage === 'library' && <div className="space-y-8">
          <section id="glossary" className="rounded-[28px] border border-white/10 bg-slate-900/80 p-5 md:p-8">
            <div className="mb-6 flex items-center gap-3"><Search className="text-amber-300" /><div><p className="text-xs uppercase tracking-[0.25em] text-slate-400">Терминдер сөздігі</p><h2 className="text-3xl font-bold text-white">15 тарихи термин</h2></div></div>
            <div className="mb-5 rounded-2xl border border-slate-700 bg-slate-950/50 p-3"><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Терминді немесе анықтаманы іздеңіз..." className="w-full border-0 bg-transparent text-slate-100 outline-none placeholder:text-slate-500" /></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredGlossary.map((item) => <article key={item.term} className="rounded-[22px] border border-slate-700 bg-slate-950/60 p-4"><h3 className="text-lg font-semibold text-white">{item.term}</h3><p className="mt-3 text-sm leading-6 text-slate-300">{item.definition}</p><div className="mt-3 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-sm text-sky-100"><span className="font-medium text-sky-300">Мысал:</span> {item.example}</div></article>)}</div>
          </section>

          <section id="tutor" className="rounded-[28px] border border-white/10 bg-slate-900/80 p-5 md:p-8">
            <HistoryTutor messages={historyTutorMessages} setMessages={setHistoryTutorMessages} />
          </section>
          </div>}

          {activePage === 'result' && (
          <section id="result" className="rounded-[28px] border border-white/10 bg-slate-900/80 p-5 md:p-8">
            <p className="mb-5 text-sm text-slate-300">Бұл беттегі жиынтық — браузер сессиясындағы ойын жаттығуларының нәтижесі. Сақталған, сервер тексерген тест ұпайы жеке кабинетте көрсетіледі.</p>
            {allGamesDone ? <div className="space-y-5"><div className="grid gap-4 md:grid-cols-4"><div className="rounded-[22px] border border-slate-700 bg-slate-950/60 p-4"><p className="text-sm text-slate-400">Жаттығу ұпайы</p><p className="mt-2 text-3xl font-bold text-white">{totalScore}</p></div><div className="rounded-[22px] border border-slate-700 bg-slate-950/60 p-4"><p className="text-sm text-slate-400">Ең жоғары нәтиже</p><p className="mt-2 text-3xl font-bold text-white">{Math.max(...Object.values(gameResults).map((item) => item.score))}</p></div><div className="rounded-[22px] border border-slate-700 bg-slate-950/60 p-4"><p className="text-sm text-slate-400">Дұрыс жауаптар</p><p className="mt-2 text-3xl font-bold text-white">{Object.values(gameResults).reduce((sum, item) => sum + item.correct, 0)}</p></div><div className="rounded-[22px] border border-slate-700 bg-slate-950/60 p-4"><p className="text-sm text-slate-400">Деңгей</p><p className="mt-2 text-3xl font-bold text-white">{finalLevel}</p></div></div><div className="rounded-[22px] border border-slate-700 bg-slate-950/60 p-5"><p className="text-lg font-semibold text-white">Білім деңгейі: {finalLevel}</p><p className="mt-2 text-slate-300">Сіздің ойын жаттығулары бойынша нәтижеңіз <span className="font-semibold text-amber-200">{overallPercent}%</span>. Қайта оқу керек: Кенесары қозғалысының себептері, шайқастардың хронологиясы, жер мәселесі мен ұлт-азаттық идеологиясы.</p></div><div className="flex flex-wrap gap-3"><button type="button" onClick={resetAllGames} className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-5 py-3 font-medium text-slate-900"><Printer size={18} /> Қайта бастау</button><button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full border border-slate-600 bg-slate-950 px-5 py-3 font-medium text-white"><Printer size={18} /> Нәтижені басып шығару</button></div></div> : <div className="rounded-[22px] border border-slate-700 bg-slate-950/60 p-6 text-slate-300">Барлық ойын тапсырмалары толығымен аяқталғаннан кейін қорытынды нәтиже көрсетіледі.</div>}
          </section>
          )}

          {activePage === 'login' && <AuthPage initialMode="login" onNavigate={(page) => navigateTo(page)} />}
          {activePage === 'register' && <AuthPage initialMode="register" onNavigate={(page) => navigateTo(page)} />}
          {activePage === 'reset-password' && <AuthPage initialMode="reset" onNavigate={(page) => navigateTo(page)} />}
          {activePage === 'profile' && (
            authLoading
              ? <section className="account-card"><p>Сессия тексерілуде…</p></section>
              : session
                ? <StudentDashboard key={session.user.id} onNavigate={(page) => navigateTo(page)} />
                : <AuthPage initialMode="login" onNavigate={(page) => navigateTo(page)} />
          )}
          {activePage === 'admin' && (
            authLoading
              ? <section className="account-card"><p>Құқық тексерілуде…</p></section>
              : !session
                ? <AuthPage initialMode="login" onNavigate={(page) => navigateTo(page)} />
                : profile?.role === 'admin'
                  ? <AdminDashboard key={session.user.id} />
                  : <section className="account-card"><p className="account-kicker">ҚОРҒАЛҒАН БӨЛІМ</p><h1>Қолжетімділік жоқ</h1><p>Бұл бетке тек дерекқорда әкімші рөлі тағайындалған пайдаланушы кіре алады.</p></section>
          )}
        </main>
        <footer className={`site-footer ${activePage === 'home' ? 'site-footer-home' : ''}`}>
          <button type="button" className="footer-wordmark" onClick={() => navigateTo('home')}>АЗАТТЫҚ <span>KAZAKH HISTORY</span></button>
          <p>ТАРИХТЫҢ ІЗІМЕН · 1783—1916</p>
          <button type="button" className="footer-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>ЖОҒАРЫҒА ↑</button>
        </footer>
      </div>
    </div>
  )
}

function AppWithAuth() {
  return <AuthProvider><App /></AuthProvider>
}

export default AppWithAuth
