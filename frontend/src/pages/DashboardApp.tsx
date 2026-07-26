import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { authFetch, jsonHeaders, SessionExpiredError } from '../lib/api'
import '../App.css'

type NavPage = 'dashboard' | 'tasks' | 'boards' | 'calendar' | 'team' | 'reports' | 'activity' | 'settings'

type Workspace = { id: string; name: string; description?: string | null }
type Task = { id: string; title: string; description?: string | null; status: string; priority: string; workspaceId: string; dueDate?: string | null; assignedToId?: string | null }
type Invitation = { id: string; email: string; workspaceId: string; token: string; status: string; expiresAt: string; role?: string; workspace?: { id: string; name: string } }
type Member = { id: string; userId: string; role: string; user: { id: string; firstname: string; lastName: string; email: string; avatarUrl?: string | null } }
type Session = { id: string; userAgent?: string | null; ipAddress?: string | null; createdAt: string; lastUsedAt: string; expiresAt: string; isCurrent: boolean }
type ActivityEntry = { id: string; action: string; createdAt: string; user?: { firstname: string; lastName: string } | null; workspace?: { name: string } | null; task?: { title: string } | null }

const statusColumns = ['TODO', 'IN_PROGRESS', 'REVIEW', 'COMPLETED']
const navItems: { page: NavPage; label: string; icon: string }[] = [
  { page: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { page: 'tasks', label: 'My Tasks', icon: '☑' },
  { page: 'boards', label: 'Boards', icon: '☰' },
  { page: 'calendar', label: 'Calendar', icon: '▦' },
  { page: 'team', label: 'Team', icon: '☺' },
  { page: 'reports', label: 'Reports', icon: '↗' },
  { page: 'activity', label: 'Activity', icon: '⧖' },
  { page: 'settings', label: 'Settings', icon: '⚙' },
]
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const LANGUAGES: Record<string, string> = {
  en: 'English', sw: 'Kiswahili', fr: 'Français', ko: '한국어', es: 'Español', zh: '中文', lg: 'Luganda'
}
type TranslationMap = Record<string, Record<string, string>>
const translations: TranslationMap = {
  dashboard: { en: 'Dashboard', sw: 'Dashibodi', fr: 'Tableau de bord', ko: '대시보드', es: 'Panel', zh: '仪表盘', lg: 'Ddaabadi' },
  myTasks: { en: 'My Tasks', sw: 'Kazi Zangu', fr: 'Mes Tâches', ko: '내 작업', es: 'Mis Tareas', zh: '我的任务', lg: 'Emirimu Gyange' },
  boards: { en: 'Boards', sw: 'Mbao', fr: 'Tableaux', ko: '보드', es: 'Tableros', zh: '看板', lg: 'Mbaao' },
  calendar: { en: 'Calendar', sw: 'Kalenda', fr: 'Calendrier', ko: '달력', es: 'Calendario', zh: '日历', lg: 'Kalenda' },
  team: { en: 'Team', sw: 'Timu', fr: 'Équipe', ko: '팀', es: 'Equipo', zh: '团队', lg: 'Ttiimu' },
  reports: { en: 'Reports', sw: 'Ripoti', fr: 'Rapports', ko: '리포트', es: 'Informes', zh: '报告', lg: 'Lipooti' },
  activity: { en: 'Activity', sw: 'Shughuli', fr: 'Activité', ko: '활동', es: 'Actividad', zh: '活动', lg: 'Ebikolwa' },
  settings: { en: 'Settings', sw: 'Mipangilio', fr: 'Paramètres', ko: '설정', es: 'Ajustes', zh: '设置', lg: 'Enteeka' },
  morning: { en: 'Good morning', sw: 'Habari za asubuhi', fr: 'Bonjour', ko: '좋은 아침', es: 'Buenos días', zh: '早上好', lg: 'Wasuze otya' },
  afternoon: { en: 'Good afternoon', sw: 'Habari za mchana', fr: 'Bon après-midi', ko: '좋은 오후', es: 'Buenas tardes', zh: '下午好', lg: 'Osiibye otya' },
  evening: { en: 'Good evening', sw: 'Habari za jioni', fr: 'Bonsoir', ko: '좋은 저녁', es: 'Buenas noches', zh: '晚上好', lg: 'Osiibye otya' },
  taskDescription: { en: 'Description', sw: 'Maelezo', fr: 'Description', ko: '설명', es: 'Descripción', zh: '描述', lg: 'Okunnyonnyola' },
  assignTo: { en: 'Assign to...', sw: 'Kwa...', fr: 'Assigner à...', ko: '할당...', es: 'Asignar a...', zh: '分配给...', lg: 'Gaba eri...' },
  noTasks: { en: 'No tasks', sw: 'Hakuna kazi', fr: 'Aucune tâche', ko: '작업 없음', es: 'Sin tareas', zh: '没有任务', lg: 'Tewali mirimu' },
  overview: { en: 'Overview', sw: 'Muhtasari', fr: 'Aperçu', ko: '개요', es: 'Resumen', zh: '概览', lg: 'Endabirira' },
  total: { en: 'Total', sw: 'Jumla', fr: 'Total', ko: '합계', es: 'Total', zh: '总计', lg: 'Omuwendo' },
  completed: { en: 'Completed', sw: 'Imekamilika', fr: 'Terminé', ko: '완료됨', es: 'Completado', zh: '已完成', lg: 'Okumaliriza' },
  inProgress: { en: 'In progress', sw: 'Inaendelea', fr: 'En cours', ko: '진행 중', es: 'En progreso', zh: '进行中', lg: 'Kiri mu maaso' },
  overdue: { en: 'Overdue', sw: 'Imechelewa', fr: 'En retard', ko: '기한 초과', es: 'Vencido', zh: '已逾期', lg: 'Kiyise' },
  teamMembers: { en: 'Team members', sw: 'Wanatimu', fr: 'Membres', ko: '팀 멤버', es: 'Miembros del equipo', zh: '团队成员', lg: 'Abomu ttiimu' },
  recentTasks: { en: 'Recent tasks', sw: 'Kazi za hivi karibuni', fr: 'Taches recentes', ko: '최근 작업', es: 'Tareas recientes', zh: '最近的任务', lg: 'Emirimu ebya kumpi' },
  deadlines: { en: 'Upcoming deadlines', sw: 'Tarehe zinazokuja', fr: 'Échéances à venir', ko: '다가오는 마감', es: 'Próximos vencimientos', zh: '即将截止', lg: 'Enaku ezijja' },
  profile: { en: 'Profile', sw: 'Wasifu', fr: 'Profil', ko: '프로필', es: 'Perfil', zh: '个人资料', lg: 'Pulofayiro' },
  preferences: { en: 'Preferences', sw: 'Mapendeleo', fr: 'Préférences', ko: '환경 설정', es: 'Preferencias', zh: '偏好设置', lg: 'Okusalawo' },
  language: { en: 'Language', sw: 'Lugha', fr: 'Langue', ko: '언어', es: 'Idioma', zh: '语言', lg: 'Olulimi' },
  fontStyle: { en: 'Font style', sw: 'Mtindo wa herufi', fr: 'Style de police', ko: '글꼴 스타일', es: 'Estilo de fuente', zh: '字体风格', lg: 'Enkola y\'ennukuta' },
  colorTheme: { en: 'Color theme', sw: 'Mandhari ya rangi', fr: 'Thème de couleur', ko: '색상 테마', es: 'Tema de color', zh: '颜色主题', lg: 'Essomero l\'langi' },
  avatarUrl: { en: 'Avatar image URL', sw: 'URL ya picha', fr: 'URL de l\'avatar', ko: '아바타 이미지 URL', es: 'URL de avatar', zh: '头像图片链接', lg: 'URL y\'endabirira' },
  uploadPhoto: { en: 'Upload from device', sw: 'Pakia kutoka kifaa', fr: 'Télécharger', ko: '기기에서 업로드', es: 'Subir desde dispositivo', zh: '从设备上传', lg: 'Pulika okuva ku kifaananyi' },
  bio: { en: 'Bio', sw: 'Wasifu', fr: 'Biographie', ko: '소개', es: 'Biografía', zh: '简介', lg: 'Ebyafaayo' },
  invite: { en: 'Invite member', sw: 'Alika mwanatimu', fr: 'Inviter un membre', ko: '멤버 초대', es: 'Invitar miembro', zh: '邀请成员', lg: 'Yita omu ttiimu' },
  workspaceName: { en: 'Workspace name', sw: 'Jina la eneo la kazi', fr: 'Nom de l\'espace', ko: '워크스페이스 이름', es: 'Nombre del espacio', zh: '工作区名称', lg: 'Erinnya ly\'ekifo ky\'omulimu' },
  sendInvite: { en: 'Send invite', sw: 'Tuma mwaliko', fr: 'Envoyer l\'invitation', ko: '초대 보내기', es: 'Enviar invitación', zh: '发送邀请', lg: 'Tuma obuyito' },
  pendingInvites: { en: 'Pending invitations', sw: 'Mialiko inayosubiri', fr: 'Invitations en attente', ko: '대기 중인 초대', es: 'Invitaciones pendientes', zh: '待处理的邀请', lg: 'Obuyito obulindirira' },
  members: { en: 'Members', sw: 'Wanachama', fr: 'Membres', ko: '멤버', es: 'Miembros', zh: '成员', lg: 'Ab\'omu ttiimu' },
  createWorkspace: { en: 'Create workspace', sw: 'Tengeneza eneo la kazi', fr: 'Créer un espace', ko: '워크스페이스 만들기', es: 'Crear espacio', zh: '创建工作区', lg: 'Tonda ekifo ky\'omulimu' },
  progress: { en: 'Progress', sw: 'Maendeleo', fr: 'Progrès', ko: '진행률', es: 'Progreso', zh: '进度', lg: 'Okukulaakulana' },
  addWorkspace: { en: 'Add workspace', sw: 'Ongeza eneo', fr: 'Ajouter un espace', ko: '추가', es: 'Añadir espacio', zh: '添加', lg: 'Yongera' },
  saveProfile: { en: 'Save profile', sw: 'Hifadhi wasifu', fr: 'Enregistrer le profil', ko: '프로필 저장', es: 'Guardar perfil', zh: '保存资料', lg: 'Kkweka pulofayiro' },
  savePrefs: { en: 'Save preferences', sw: 'Hifadhi mapendeleo', fr: 'Enregistrer les préférences', ko: '환경 설정 저장', es: 'Guardar preferencias', zh: '保存偏好', lg: 'Kkweka okusalawo' },
  markAllRead: { en: 'Mark all read', sw: 'Soma zote', fr: 'Tout marquer lu', ko: '모두 읽음', es: 'Marcar todo leído', zh: '全部标记已读', lg: 'Soma zonna' },
  noNotifs: { en: 'No notifications', sw: 'Hakuna arifa', fr: 'Aucune notification', ko: '알림 없음', es: 'Sin notificaciones', zh: '没有通知', lg: 'Tewali kutegeesa' },
  welcome: { en: 'Welcome back', sw: 'Karibu tena', fr: 'Bon retour', ko: '다시 오신 것을 환영합니다', es: 'Bienvenido de nuevo', zh: '欢迎回来', lg: 'Tunakwaniriza' },
}

function t(key: string, lang: string): string {
  return translations[key]?.[lang] || translations[key]?.['en'] || key
}
const greeting = (lang: string): string => {
  const hour = new Date().getHours()
  const key = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  return t(key, lang)
}
const FONTS = ['default', 'serif', 'mono', 'georgia', 'impact', 'comic', 'courier', 'fantasy', 'trebuchet']
const COLORS = ['purple', 'blue', 'green', 'orange', 'red', 'pink', 'teal', 'yellow', 'indigo']
const ASSIGNABLE_ROLES = ['ADMIN', 'MANAGER', 'MEMBER']

export default function DashboardApp() {
  const { user, setUser, logout: authLogout } = useAuth()
  const navigate = useNavigate()

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [workspaceName, setWorkspaceName] = useState('')
  const [workspaceDescription, setWorkspaceDescription] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskPriority, setTaskPriority] = useState('MEDIUM')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskTime, setTaskTime] = useState('')
  const [taskAssignedTo, setTaskAssignedTo] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('MEMBER')
  const [myInvitations, setMyInvitations] = useState<Invitation[]>([])
  const [workspaceInvitations, setWorkspaceInvitations] = useState<Invitation[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [navPage, setNavPage] = useState<NavPage>('dashboard')
  const [notifCount, setNotifCount] = useState(0)
  const [notifList, setNotifList] = useState<{ id: string; message: string; isRead: boolean; createdAt: string }[]>([])
  const [showNotifs, setShowNotifs] = useState(false)
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calDayTasks, setCalDayTasks] = useState<Task[] | null>(null)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'info' | 'success' | 'error'>('info')
  const [reportsSummary, setReportsSummary] = useState<{ total: number; completed: number; inProgress: number; overdue: number } | null>(null)
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  // Settings state — seeded once from the authenticated user (ProtectedRoute
  // guarantees `user` is already loaded before this component mounts).
  const [settingsName, setSettingsName] = useState(() => user?.firstname || '')
  const [settingsLast, setSettingsLast] = useState(() => user?.lastName || '')
  const [settingsAvatar, setSettingsAvatar] = useState(() => user?.avatarUrl || '')
  const [settingsBio, setSettingsBio] = useState(() => user?.bio || '')
  const [settingsLang, setSettingsLang] = useState(() => user?.language || 'en')
  const [settingsFont, setSettingsFont] = useState(() => user?.fontStyle || 'default')
  const [settingsColor, setSettingsColor] = useState(() => user?.colorTheme || 'purple')

  const showMessage = useCallback((msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    setMessage(msg); setMessageType(type)
    setTimeout(() => setMessage(''), 2500)
  }, [])

  const request = useCallback(async (input: string, init?: RequestInit) => {
    try {
      return await authFetch(input, init)
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        await authLogout()
        navigate('/login')
      }
      throw err
    }
  }, [authLogout, navigate])

  const loadWorkspaces = useCallback(async () => {
    try {
      const d = await request('/api/workspaces') as { workspaces: Workspace[] }
      setWorkspaces(d.workspaces || [])
      setSelectedWorkspaceId(prev => prev || d.workspaces?.[0]?.id || '')
    } catch { setWorkspaces([]) }
  }, [request])

  const loadTasks = useCallback(async () => {
    if (!selectedWorkspaceId) return
    try { const d = await request(`/api/tasks?workspaceId=${selectedWorkspaceId}`) as { tasks: Task[] }; setTasks(d.tasks || []) } catch { setTasks([]) }
  }, [request, selectedWorkspaceId])

  const loadMyInvitations = useCallback(async () => {
    try { const d = await request('/api/invitations/mine') as { invitations: Invitation[] }; setMyInvitations(d.invitations || []) } catch { setMyInvitations([]) }
  }, [request])

  const loadWorkspaceInvitations = useCallback(async () => {
    if (!selectedWorkspaceId) return
    try { const d = await request(`/api/invitations/workspace/${selectedWorkspaceId}`) as { invitations: Invitation[] }; setWorkspaceInvitations(d.invitations || []) } catch { setWorkspaceInvitations([]) }
  }, [request, selectedWorkspaceId])

  const loadMembers = useCallback(async () => {
    if (!selectedWorkspaceId) return
    try { const d = await request(`/api/workspaces/${selectedWorkspaceId}/members`) as { members: Member[] }; setMembers(d.members || []) } catch { setMembers([]) }
  }, [request, selectedWorkspaceId])

  const loadNotifs = useCallback(async () => {
    try { const d = await request('/api/notifications/unread-count') as { count: number }; setNotifCount(d.count ?? 0) } catch { /* ignore */ }
  }, [request])

  const loadNotifList = useCallback(async () => {
    try { const d = await request('/api/notifications') as { notifications: typeof notifList }; setNotifList(d.notifications || []) } catch { /* ignore */ }
  }, [request])

  const loadReports = useCallback(async () => {
    try { const d = await request('/api/reports') as { summary: typeof reportsSummary }; setReportsSummary(d.summary) } catch { setReportsSummary(null) }
  }, [request])

  const loadActivity = useCallback(async () => {
    try { const d = await request('/api/activity') as { activity: ActivityEntry[] }; setActivityLog(d.activity || []) } catch { setActivityLog([]) }
  }, [request])

  const loadSessions = useCallback(async () => {
    try {
      const refreshToken = localStorage.getItem('taskmanager_refresh_token') || ''
      const d = await request(`/api/auth/sessions?refreshToken=${encodeURIComponent(refreshToken)}`) as { sessions: Session[] }
      setSessions(d.sessions || [])
    } catch { setSessions([]) }
  }, [request])

  // These fetch-on-mount / fetch-on-tab-change effects call async loaders whose
  // setState calls happen after an await, not synchronously during the effect —
  // safe, but the lint rule can't distinguish that from a genuine sync setState.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadWorkspaces(); loadMyInvitations(); loadNotifs() }, [loadWorkspaces, loadMyInvitations, loadNotifs])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadTasks(); loadMembers(); loadWorkspaceInvitations() }, [loadTasks, loadMembers, loadWorkspaceInvitations])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (navPage === 'reports') loadReports() }, [navPage, loadReports])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (navPage === 'activity') loadActivity() }, [navPage, loadActivity])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (navPage === 'settings') loadSessions() }, [navPage, loadSessions])

  useEffect(() => {
    const interval = setInterval(loadNotifs, 30000)
    return () => clearInterval(interval)
  }, [loadNotifs])


  const handleCreateWorkspace = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    try {
      const d = await request('/api/workspaces', {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({ name: workspaceName, description: workspaceDescription }),
      }) as { workspace: Workspace }
      setWorkspaceName(''); setWorkspaceDescription(''); setSelectedWorkspaceId(d.workspace.id)
      await loadWorkspaces(); showMessage('Workspace created', 'success')
    } catch (err) { showMessage(err instanceof Error ? err.message : 'Unable to create workspace', 'error') }
  }

  const handleCreateTask = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    try {
      let dueDateTime = taskDueDate || null
      if (dueDateTime && taskTime) dueDateTime = `${taskDueDate}T${taskTime}:00`
      const body: Record<string, unknown> = {
        title: taskTitle, description: taskDescription, priority: taskPriority,
        dueDate: dueDateTime, workspaceId: selectedWorkspaceId,
      }
      if (taskAssignedTo) body.assignedToId = taskAssignedTo
      await request('/api/tasks', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) })
      setTaskTitle(''); setTaskDescription(''); setTaskPriority('MEDIUM'); setTaskDueDate(''); setTaskTime(''); setTaskAssignedTo('')
      await loadTasks(); showMessage('Task added', 'success')
    } catch (err) { showMessage(err instanceof Error ? err.message : 'Unable to create task', 'error') }
  }

  const handleMoveTask = async (taskId: string, nextStatus: string) => {
    try {
      await request(`/api/tasks/${taskId}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ status: nextStatus }) })
      await loadTasks()
    } catch (err) { showMessage(err instanceof Error ? err.message : 'Unable to update task', 'error') }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Delete this task?')) return
    try {
      await request(`/api/tasks/${taskId}`, { method: 'DELETE' })
      await loadTasks(); showMessage('Task deleted', 'info')
    } catch (err) { showMessage(err instanceof Error ? err.message : 'Unable to delete task', 'error') }
  }

  const handleInviteMember = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedWorkspaceId) return
    try {
      const d = await request('/api/invitations', {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({ email: inviteEmail, workspaceId: selectedWorkspaceId, role: inviteRole }),
      }) as { message: string }
      setInviteEmail(''); showMessage(d.message || 'Invitation sent', 'success'); await loadWorkspaceInvitations()
    } catch (err) { showMessage(err instanceof Error ? err.message : 'Unable to send invitation', 'error') }
  }

  const handleAcceptInvitation = async (token: string) => {
    try {
      const d = await request(`/api/invitations/${token}/accept`, { method: 'POST' }) as { message: string }
      showMessage(d.message || 'Joined workspace', 'success'); await loadMyInvitations(); await loadWorkspaces()
    } catch (err) { showMessage(err instanceof Error ? err.message : 'Unable to accept', 'error') }
  }

  const handleCancelInvitation = async (id: string) => {
    try {
      await request(`/api/invitations/${id}`, { method: 'DELETE' })
      showMessage('Invitation cancelled', 'info'); await loadWorkspaceInvitations()
    } catch (err) { showMessage(err instanceof Error ? err.message : 'Unable to cancel', 'error') }
  }

  const handleUpdateMemberRole = async (memberId: string, role: string) => {
    try {
      await request(`/api/workspaces/${selectedWorkspaceId}/members/${memberId}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ role }) })
      await loadMembers(); showMessage('Member role updated', 'success')
    } catch (err) { showMessage(err instanceof Error ? err.message : 'Unable to update role', 'error') }
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Remove this member from the workspace?')) return
    try {
      await request(`/api/workspaces/${selectedWorkspaceId}/members/${memberId}`, { method: 'DELETE' })
      await loadMembers(); showMessage('Member removed', 'info')
    } catch (err) { showMessage(err instanceof Error ? err.message : 'Unable to remove member', 'error') }
  }

  const handleSaveSettings = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    try {
      const d = await request('/api/settings/profile', {
        method: 'PATCH', headers: jsonHeaders,
        body: JSON.stringify({
          firstname: settingsName, lastName: settingsLast, avatarUrl: settingsAvatar || null,
          bio: settingsBio || null, language: settingsLang, fontStyle: settingsFont, colorTheme: settingsColor,
        }),
      }) as { user: typeof user }
      if (d.user) setUser(d.user)
      showMessage('Settings saved', 'success')
    } catch (err) { showMessage(err instanceof Error ? err.message : 'Unable to save', 'error') }
  }

  const handleChangePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    try {
      const d = await request('/api/settings/password', {
        method: 'PATCH', headers: jsonHeaders,
        body: JSON.stringify({ currentPassword, newPassword }),
      }) as { message: string }
      setCurrentPassword(''); setNewPassword('')
      showMessage(d.message || 'Password changed', 'success')
      await loadSessions()
    } catch (err) { showMessage(err instanceof Error ? err.message : 'Unable to change password', 'error') }
  }

  const handleRevokeSession = async (id: string) => {
    try {
      await request(`/api/auth/sessions/${id}`, { method: 'DELETE' })
      await loadSessions(); showMessage('Session revoked', 'info')
    } catch (err) { showMessage(err instanceof Error ? err.message : 'Unable to revoke session', 'error') }
  }

  const handleLogoutAllDevices = async () => {
    if (!confirm('This will sign you out on every device, including this one. Continue?')) return
    try {
      await request('/api/auth/logout-all', { method: 'POST' })
      await authLogout(); navigate('/login')
    } catch (err) { showMessage(err instanceof Error ? err.message : 'Unable to log out everywhere', 'error') }
  }

  const handleMarkNotifRead = async (id: string) => {
    try {
      await request(`/api/notifications/${id}/read`, { method: 'PATCH' })
      setNotifList(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
      setNotifCount(prev => Math.max(0, prev - 1))
    } catch { /* ignore */ }
  }

  const handleMarkAllRead = async () => {
    try {
      await request('/api/notifications/read-all', { method: 'POST' })
      setNotifCount(0); setNotifList(prev => prev.map(n => ({ ...n, isRead: true })))
    } catch { /* ignore */ }
  }

  const logout = async () => { await authLogout(); navigate('/login') }

  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {}
    tasks.filter(tk => tk.dueDate).forEach(tk => {
      const key = new Date(tk.dueDate!).toDateString()
      if (!map[key]) map[key] = []
      map[key].push(tk)
    })
    return map
  }, [tasks])

  if (!user) return null

  const selectedWs = workspaces.find(w => w.id === selectedWorkspaceId)
  const myTasks = tasks.filter(tk => tk.assignedToId === user.id)
  const overdueTasks = tasks.filter(tk => tk.dueDate && new Date(tk.dueDate) < new Date())
  const upcomingDeadlines = tasks.filter(tk => tk.dueDate).sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()).slice(0, 5)
  const myMembership = members.find(m => m.userId === user.id)
  const canManageMembers = myMembership && (myMembership.role === 'OWNER' || myMembership.role === 'ADMIN')

  const firstDay = new Date(calYear, calMonth, 1).getDay()
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const calDays = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const totalTasks = tasks.length
  const completedTasks = tasks.filter(tk => tk.status === 'COMPLETED').length
  const inProgressTasks = tasks.filter(tk => tk.status === 'IN_PROGRESS').length
  const todoTasks = tasks.filter(tk => tk.status === 'TODO').length
  const reviewTasks = tasks.filter(tk => tk.status === 'REVIEW').length
  const completionPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  const themeClass = `theme-${settingsColor || 'purple'} font-${settingsFont || 'default'}`

  return (
    <main className={`dashboard-shell ${themeClass}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <p className="eyebrow">Taskly</p>
          <h2>{user.firstname} {user.lastName}</h2>
          <p>{selectedWs?.name || t('overview', settingsLang)}</p>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(({ page, icon }) => (
            <button key={page} className={`nav-item ${navPage === page ? 'active' : ''}`} onClick={() => setNavPage(page)}>
              <span className="nav-icon">{icon}</span>
              <span>{t(page === 'tasks' ? 'myTasks' : page, settingsLang)}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {user.avatarUrl
                ? <img src={user.avatarUrl} alt="" style={{ width: 28, height: 28, borderRadius: 8, objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.textContent = user.firstname.charAt(0).toUpperCase() }} />
                : user.firstname.charAt(0).toUpperCase()}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user.firstname}</div>
              <div className="sidebar-user-email">{user.email}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={logout} title="Sign out">{'➡'}</button>
        </div>
      </aside>

      <div className="main-area">
        <div className="main-topbar">
          <div>
            <h1>{greeting(settingsLang)}, {user.firstname}</h1>
            <p>{selectedWs?.name || ''}</p>
          </div>
          <div className="main-topbar-actions">
            <div className="workspace-selector">
              {workspaces.map(ws => (
                <button key={ws.id} type="button"
                  className={`workspace-chip ${selectedWorkspaceId === ws.id ? 'active' : ''}`}
                  onClick={() => setSelectedWorkspaceId(ws.id)}>
                  {ws.name}
                </button>
              ))}
            </div>
            <div className="notif-bell" onClick={() => { setShowNotifs(!showNotifs); if (!showNotifs) loadNotifList() }}>
              {'🔔'}
              {notifCount > 0 && <span className="notif-badge">{notifCount}</span>}
              {showNotifs && (
                <div className="notif-dropdown">
                  <div className="notif-dropdown-header">
                    <strong>Notifications</strong>
                    {notifCount > 0 && <button className="mini-btn" onClick={handleMarkAllRead}>Mark all read</button>}
                  </div>
                  {notifList.length === 0 ? <p className="empty-column">No notifications</p> : (
                    notifList.slice(0, 10).map(n => (
                      <div key={n.id} className={`notif-item ${n.isRead ? '' : 'unread'}`} onClick={() => !n.isRead && handleMarkNotifRead(n.id)} style={{ cursor: n.isRead ? 'default' : 'pointer' }}>
                        {n.message}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="topbar-avatar" onClick={() => setNavPage('settings')} title={t('settings', settingsLang)}>
              <div className="sidebar-avatar">
                {user.avatarUrl
                  ? <img src={user.avatarUrl} alt="" style={{ width: 28, height: 28, borderRadius: 8, objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.textContent = user.firstname.charAt(0).toUpperCase() }} />
                  : user.firstname.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </div>

        <div className="main-content">
          {myInvitations.length > 0 && (
            <div className="invite-banner">
              <h3>{t('pendingInvites', settingsLang)}</h3>
              {myInvitations.map(inv => (
                <div key={inv.id} className="invite-banner-item">
                  <span>{t('welcome', settingsLang)} <strong>{inv.workspace?.name || ''}</strong></span>
                  <button type="button" className="mini-btn accept-btn" onClick={() => handleAcceptInvitation(inv.token)}>Accept</button>
                </div>
              ))}
            </div>
          )}

          {message && <div className={`message-bar ${messageType}`}>{message}</div>}

          {navPage === 'dashboard' && (
            <>
              <div className="dashboard-grid">
                <div className="panel full-width">
                  <h2>{t('overview', settingsLang)}</h2>
                  <div className="task-summary-grid">
                    <div className="summary-card"><strong>{totalTasks}</strong>{t('total', settingsLang)}</div>
                    <div className="summary-card"><strong>{completedTasks}</strong>{t('completed', settingsLang)}</div>
                    <div className="summary-card"><strong>{inProgressTasks}</strong>{t('inProgress', settingsLang)}</div>
                    <div className="summary-card"><strong>{overdueTasks.length}</strong>{t('overdue', settingsLang)}</div>
                    <div className="summary-card"><strong>{myTasks.length}</strong>{t('myTasks', settingsLang)}</div>
                    <div className="summary-card"><strong>{members.length}</strong>{t('teamMembers', settingsLang)}</div>
                  </div>
                </div>
              </div>

              <div className="dashboard-grid">
                <div className="panel">
                  <h2>{t('progress', settingsLang)}</h2>
                  {totalTasks > 0 ? (
                    <div className="donut-chart">
                      <svg viewBox="0 0 36 36" className="donut-svg">
                        <path className="donut-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <path className="donut-fill" strokeDasharray={`${completionPct}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <text x="18" y="20.5" className="donut-text">{completionPct}%</text>
                      </svg>
                    </div>
                  ) : <p className="empty-column">{t('noTasks', settingsLang)}</p>}
                  <div className="bar-chart" style={{ marginTop: 10 }}>
                    {[
                      { label: 'TODO', value: todoTasks, pct: totalTasks > 0 ? (todoTasks / totalTasks) * 100 : 0, color: '#64748b' },
                      { label: 'IN PROGRESS', value: inProgressTasks, pct: totalTasks > 0 ? (inProgressTasks / totalTasks) * 100 : 0, color: '#38bdf8' },
                      { label: 'COMPLETED', value: completedTasks, pct: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0, color: '#34d399' },
                      { label: 'OVERDUE', value: overdueTasks.length, pct: totalTasks > 0 ? (overdueTasks.length / totalTasks) * 100 : 0, color: '#f87171' },
                    ].map(bar => (
                      <div key={bar.label} className="bar-row" style={{ marginBottom: 4 }}>
                        <span className="bar-label" style={{ width: 80 }}>{bar.label}</span>
                        <div className="bar-track"><div className="bar-fill" style={{ width: `${bar.pct}%`, background: bar.color }} /></div>
                        <span className="bar-value">{bar.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="panel">
                  <h2>{t('recentTasks', settingsLang)}</h2>
                  {tasks.slice(0, 5).map(tk => (
                    <div key={tk.id} className="recent-task-item">
                      <strong>{tk.title}</strong>
                      <span className={`priority-badge ${tk.priority.toLowerCase()}`}>{tk.priority}</span>
                      <span className={`status-badge ${tk.status.toLowerCase()}`}>{tk.status.replace('_', ' ')}</span>
                    </div>
                  ))}
                  {tasks.length === 0 && <p className="empty-column">{t('noTasks', settingsLang)}</p>}
                </div>
              </div>

              <div className="dashboard-grid">
                <div className="panel full-width">
                  <h2>{t('deadlines', settingsLang)}</h2>
                  {upcomingDeadlines.map(tk => (
                    <div key={tk.id} className="recent-task-item">
                      <strong>{tk.title}</strong>
                      <span>{new Date(tk.dueDate!).toLocaleDateString()} {tk.dueDate!.includes('T') ? new Date(tk.dueDate!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                  ))}
                  {upcomingDeadlines.length === 0 && <p className="empty-column">{t('noTasks', settingsLang)}</p>}
                </div>
              </div>
            </>
          )}

          {navPage === 'tasks' && (
            <div className="panel full-width">
              <h2>My Tasks</h2>
              <div className="stack-form" style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="New task title" />
                <select value={taskPriority} onChange={e => setTaskPriority(e.target.value)}>
                  <option value="LOW">Low</option><option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option><option value="CRITICAL">Critical</option>
                </select>
                <input type="date" value={taskDueDate} onChange={e => setTaskDueDate(e.target.value)} />
                <input type="time" value={taskTime} onChange={e => setTaskTime(e.target.value)} />
                <select value={taskAssignedTo} onChange={e => setTaskAssignedTo(e.target.value)}>
                  <option value="">{t('assignTo', settingsLang)}</option>
                  {members.filter(m => m.userId !== user.id).map(m => (
                    <option key={m.userId} value={m.userId}>{m.user.firstname} {m.user.lastName}</option>
                  ))}
                </select>
                <button className="primary-btn" onClick={() => handleCreateTask({ preventDefault: () => {} } as FormEvent<HTMLFormElement>)}>Add</button>
              </div>
              <div className="task-list">
                {tasks.map(tk => (
                  <div key={tk.id} className="task-list-item">
                    <div className="task-list-info">
                      <strong>{tk.title}</strong>
                      {tk.description && <span>{tk.description}</span>}
                      <div className="task-list-meta">
                        <span className={`priority-badge ${tk.priority.toLowerCase()}`}>{tk.priority}</span>
                        <span className={`status-badge ${tk.status.toLowerCase()}`}>{tk.status.replace('_', ' ')}</span>
                        {tk.dueDate && <span>Due: {new Date(tk.dueDate).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <div className="task-list-actions">
                      <select value={tk.status} onChange={e => handleMoveTask(tk.id, e.target.value)}>
                        {statusColumns.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                      </select>
                      <button className="mini-btn danger-btn" onClick={() => handleDeleteTask(tk.id)}>{'✖'}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {navPage === 'boards' && (
            <>
              <div className="panel" style={{ marginBottom: 16 }}>
                <div className="stack-form" style={{ flexDirection: 'row', gap: 8 }}>
                  <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Task title" required />
                  <select value={taskPriority} onChange={e => setTaskPriority(e.target.value)}>
                    <option value="LOW">Low</option><option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option><option value="CRITICAL">Critical</option>
                  </select>
                  <input type="date" value={taskDueDate} onChange={e => setTaskDueDate(e.target.value)} />
                  <input type="time" value={taskTime} onChange={e => setTaskTime(e.target.value)} />
                  <button onClick={() => handleCreateTask({ preventDefault: () => {} } as FormEvent<HTMLFormElement>)}>Add task</button>
                </div>
              </div>
              <div className="kanban-board">
                {statusColumns.map(status => (
                  <div key={status} className="kanban-column">
                    <h3>{status.replace('_', ' ')}</h3>
                    {tasks.filter(tk => tk.status === status).length === 0
                      ? <p className="empty-column">No tasks</p>
                      : tasks.filter(tk => tk.status === status).map(tk => (
                        <div key={tk.id} className="task-card">
                          <strong>{tk.title}</strong>
                          {tk.description && <p>{tk.description}</p>}
                          <p className="task-meta">Priority: {tk.priority}</p>
                          {tk.dueDate && <p className="task-meta">Due: {new Date(tk.dueDate).toLocaleDateString()}</p>}
                          <div className="task-actions">
                            {statusColumns.filter(c => c !== status).map(ns => (
                              <button key={ns} type="button" className="mini-btn" style={{ background: '#1c1f30', color: '#94a3b8' }}
                                onClick={() => handleMoveTask(tk.id, ns)}>{ns.replace('_', ' ')}</button>
                            ))}
                            <button type="button" className="mini-btn danger-btn" onClick={() => handleDeleteTask(tk.id)}>{'✖'}</button>
                          </div>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            </>
          )}

          {navPage === 'calendar' && (
            <div className="panel full-width">
              <h2>Calendar</h2>
              <div className="cal-nav">
                <button className="mini-btn" onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1) } else setCalMonth(calMonth - 1) }}>{'◀'}</button>
                <strong>{MONTHS[calMonth]} {calYear}</strong>
                <button className="mini-btn" onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1) } else setCalMonth(calMonth + 1) }}>{'▶'}</button>
              </div>
              <div className="cal-grid">
                {DAYS.map(d => <div key={d} className="cal-header">{d}</div>)}
                {Array.from({ length: firstDay }, (_, i) => <div key={`empty-${i}`} className="cal-day empty" />)}
                {calDays.map(d => {
                  const date = new Date(calYear, calMonth, d)
                  const key = date.toDateString()
                  const dayTasks = tasksByDate[key] || []
                  const isToday = date.toDateString() === new Date().toDateString()
                  return (
                    <div key={d} className={`cal-day ${isToday ? 'today' : ''} ${dayTasks.length > 0 ? 'has-tasks' : ''}`}
                      onClick={() => setCalDayTasks(calDayTasks && calDayTasks[0]?.dueDate && new Date(calDayTasks[0].dueDate!).toDateString() === key ? null : dayTasks)}>
                      <span>{d}</span>
                      {dayTasks.length > 0 && <span className="cal-dot">{dayTasks.length}</span>}
                    </div>
                  )
                })}
              </div>
              {calDayTasks && calDayTasks.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <h3>Tasks for {calDayTasks[0].dueDate ? new Date(calDayTasks[0].dueDate!).toLocaleDateString() : ''}</h3>
                  {calDayTasks.map(tk => (
                    <div key={tk.id} className="recent-task-item">
                      <strong>{tk.title}</strong>
                      <span className={`priority-badge ${tk.priority.toLowerCase()}`}>{tk.priority}</span>
                      <span className={`status-badge ${tk.status.toLowerCase()}`}>{tk.status.replace('_', ' ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {navPage === 'team' && (
            <div className="dashboard-grid">
              <div className="panel">
                <h2>{t('createWorkspace', settingsLang)}</h2>
                <form className="stack-form" onSubmit={handleCreateWorkspace}>
                  <input value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} placeholder={t('workspaceName', settingsLang)} required />
                  <input value={workspaceDescription} onChange={e => setWorkspaceDescription(e.target.value)} placeholder={t('taskDescription', settingsLang)} />
                  <button type="submit">{t('addWorkspace', settingsLang)}</button>
                </form>
              </div>

              <div className="panel">
                <h2>{t('members', settingsLang)} ({members.length})</h2>
                <div className="member-list">
                  {members.map(m => (
                    <div key={m.id} className="member-item">
                      <div className="sidebar-avatar">{m.user.firstname.charAt(0).toUpperCase()}</div>
                      <div className="member-info">
                        <strong>{m.user.firstname} {m.user.lastName}</strong>
                        <span>{m.user.email}</span>
                      </div>
                      {canManageMembers && m.role !== 'OWNER' ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <select value={m.role} onChange={e => handleUpdateMemberRole(m.id, e.target.value)} style={{ fontSize: '0.75rem' }}>
                            {ASSIGNABLE_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <button type="button" className="mini-btn danger-btn" onClick={() => handleRemoveMember(m.id)}>{'✖'}</button>
                        </div>
                      ) : (
                        <span className={`role-badge ${m.role.toLowerCase()}`}>{m.role}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel">
                <h2>{t('invite', settingsLang)}</h2>
                <form className="stack-form" onSubmit={handleInviteMember}>
                  <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="colleague@company.com" required />
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                    <option value="MEMBER">Member</option>
                    <option value="MANAGER">Manager</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  <button type="submit">{t('sendInvite', settingsLang)}</button>
                </form>

                {workspaceInvitations.filter(i => i.status === 'PENDING').length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <h3>{t('pendingInvites', settingsLang)}</h3>
                    <div className="invite-list">
                      {workspaceInvitations.filter(i => i.status === 'PENDING').map(inv => (
                        <div key={inv.id} className="invite-item">
                          <span>{inv.email} <span className="role-badge member">{inv.role || 'MEMBER'}</span></span>
                          <button type="button" className="mini-btn danger-btn" onClick={() => handleCancelInvitation(inv.id)}>Cancel</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {navPage === 'reports' && (
            <div className="dashboard-grid">
              <div className="panel full-width">
                <h2>Progress overview {reportsSummary && <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 400 }}>(all workspaces)</span>}</h2>
                <div className="task-summary-grid">
                  <div className="summary-card"><strong>{reportsSummary?.total ?? totalTasks}</strong>Total tasks</div>
                  <div className="summary-card"><strong>{reportsSummary?.completed ?? completedTasks}</strong>Completed</div>
                  <div className="summary-card"><strong>{reportsSummary?.inProgress ?? inProgressTasks}</strong>In progress</div>
                  <div className="summary-card"><strong>{reviewTasks}</strong>In review</div>
                  <div className="summary-card"><strong>{todoTasks}</strong>To do</div>
                  <div className="summary-card"><strong>{reportsSummary?.overdue ?? overdueTasks.length}</strong>Overdue</div>
                </div>
              </div>

              <div className="panel">
                <h2>Completion rate</h2>
                {totalTasks > 0 ? (
                  <div className="donut-chart">
                    <svg viewBox="0 0 36 36" className="donut-svg">
                      <path className="donut-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      <path className="donut-fill" strokeDasharray={`${completionPct}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      <text x="18" y="20.5" className="donut-text">{completionPct}%</text>
                    </svg>
                  </div>
                ) : <p className="empty-column">No data</p>}
              </div>

              <div className="panel">
                <h2>Tasks by status</h2>
                {totalTasks > 0 ? (
                  <div className="bar-chart">
                    {[
                      { label: 'TODO', value: todoTasks, pct: totalTasks > 0 ? (todoTasks / totalTasks) * 100 : 0, color: '#64748b' },
                      { label: 'IN PROGRESS', value: inProgressTasks, pct: totalTasks > 0 ? (inProgressTasks / totalTasks) * 100 : 0, color: '#38bdf8' },
                      { label: 'REVIEW', value: reviewTasks, pct: totalTasks > 0 ? (reviewTasks / totalTasks) * 100 : 0, color: '#fbbf24' },
                      { label: 'COMPLETED', value: completedTasks, pct: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0, color: '#34d399' },
                    ].map(bar => (
                      <div key={bar.label} className="bar-row">
                        <span className="bar-label">{bar.label}</span>
                        <div className="bar-track"><div className="bar-fill" style={{ width: `${bar.pct}%`, background: bar.color }} /></div>
                        <span className="bar-value">{bar.value}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="empty-column">No data</p>}
              </div>
            </div>
          )}

          {navPage === 'activity' && (
            <div className="panel full-width">
              <h2>{t('activity', settingsLang)}</h2>
              {activityLog.length === 0 ? <p className="empty-column">No activity yet</p> : (
                <div className="task-list">
                  {activityLog.map(entry => (
                    <div key={entry.id} className="task-list-item">
                      <div className="task-list-info">
                        <strong>{entry.action}</strong>
                        <span>
                          {entry.user ? `${entry.user.firstname} ${entry.user.lastName}` : ''}
                          {entry.workspace ? ` · ${entry.workspace.name}` : ''}
                          {entry.task ? ` · ${entry.task.title}` : ''}
                        </span>
                      </div>
                      <span className="bar-label">{new Date(entry.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {navPage === 'settings' && (
            <div className="dashboard-grid">
              <div className="panel">
                <h2>{t('profile', settingsLang)}</h2>
                <form className="stack-form" onSubmit={handleSaveSettings}>
                  {settingsAvatar && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 4 }}>
                      <img src={settingsAvatar} alt="Avatar" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      <button type="button" className="mini-btn danger-btn" onClick={() => setSettingsAvatar('')}>Remove</button>
                    </div>
                  )}
                  <label>{t('uploadPhoto', settingsLang)}
                    <input type="file" accept="image/*" onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) {
                        const reader = new FileReader()
                        reader.onload = (ev) => { if (ev.target?.result) setSettingsAvatar(ev.target.result as string) }
                        reader.readAsDataURL(file)
                      }
                    }} />
                  </label>
                  <label>{t('avatarUrl', settingsLang)}
                    <input value={settingsAvatar} onChange={e => setSettingsAvatar(e.target.value)} placeholder="https://..." />
                  </label>
                  <div className="name-row">
                    <label>First name<input value={settingsName} onChange={e => setSettingsName(e.target.value)} /></label>
                    <label>Last name<input value={settingsLast} onChange={e => setSettingsLast(e.target.value)} /></label>
                  </div>
                  <label>{t('bio', settingsLang)}<textarea value={settingsBio} onChange={e => setSettingsBio(e.target.value)} rows={2} /></label>
                  <label style={{ color: '#64748b', fontSize: '0.82rem' }}>Email: {user.email}</label>
                  <button type="submit">{t('saveProfile', settingsLang)}</button>
                </form>
              </div>

              <div className="panel">
                <h2>{t('preferences', settingsLang)}</h2>
                <form className="stack-form" onSubmit={handleSaveSettings}>
                  <label>
                    {t('language', settingsLang)}
                    <select value={settingsLang} onChange={e => setSettingsLang(e.target.value)}>
                      {Object.entries(LANGUAGES).map(([code, name]) => (
                        <option key={code} value={code}>{name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('fontStyle', settingsLang)}
                    <select value={settingsFont} onChange={e => { setSettingsFont(e.target.value); document.documentElement.setAttribute('data-font', e.target.value) }}>
                      {FONTS.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                    </select>
                  </label>
                  <label>
                    {t('colorTheme', settingsLang)}
                    <select value={settingsColor} onChange={e => { setSettingsColor(e.target.value); document.documentElement.setAttribute('data-theme', e.target.value) }}>
                      {COLORS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                    </select>
                  </label>
                  <div className="theme-previews">
                    {COLORS.map(c => (
                      <div key={c} className={`theme-swatch ${settingsColor === c ? 'active' : ''} swatch-${c}`}
                        onClick={() => { setSettingsColor(c); document.documentElement.setAttribute('data-theme', c) }} />
                    ))}
                  </div>
                  <button type="submit">{t('savePrefs', settingsLang)}</button>
                </form>
              </div>

              <div className="panel">
                <h2>Change password</h2>
                <form className="stack-form" onSubmit={handleChangePassword}>
                  <input type="password" required placeholder="Current password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
                  <input type="password" required minLength={8} placeholder="New password (min 8 characters)" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                  <button type="submit">Update password</button>
                </form>
              </div>

              <div className="panel full-width">
                <h2>Active sessions</h2>
                <div className="task-list">
                  {sessions.map(s => (
                    <div key={s.id} className="task-list-item">
                      <div className="task-list-info">
                        <strong>{s.userAgent || 'Unknown device'} {s.isCurrent && <span className="role-badge member">This device</span>}</strong>
                        <span>{s.ipAddress || ''} · Last active {new Date(s.lastUsedAt).toLocaleString()}</span>
                      </div>
                      {!s.isCurrent && (
                        <button type="button" className="mini-btn danger-btn" onClick={() => handleRevokeSession(s.id)}>Revoke</button>
                      )}
                    </div>
                  ))}
                  {sessions.length === 0 && <p className="empty-column">No active sessions</p>}
                </div>
                <button type="button" className="mini-btn danger-btn" style={{ marginTop: 12 }} onClick={handleLogoutAllDevices}>Log out of all devices</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
