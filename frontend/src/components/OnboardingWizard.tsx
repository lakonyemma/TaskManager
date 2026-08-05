import { useState, type FormEvent } from 'react'
import { ArrowRight, Check, FolderPlus, Languages, Sparkles } from 'lucide-react'
import EmptyState from './EmptyState'

const COLORS = ['purple', 'blue', 'green', 'orange', 'red', 'pink', 'teal', 'yellow', 'indigo']

// A short, real 3-step first-run flow rather than a single static panel:
// Welcome -> create your first workspace -> pick a language/theme. Kept
// intentionally compact (no calendar-integration or notification-prefs
// steps, since those aren't real features of the app yet) rather than
// padding it out with steps that wouldn't do anything.
export default function OnboardingWizard({
  firstname, workspaceName, setWorkspaceName, workspaceDescription, setWorkspaceDescription,
  workspaceTemplates, workspaceTemplateId, setWorkspaceTemplateId, onCreateWorkspace, creatingWorkspace,
  languages, settingsLang, onLanguageChange, settingsColor, onColorChange, onFinish,
}: {
  firstname: string
  workspaceName: string
  setWorkspaceName: (v: string) => void
  workspaceDescription: string
  setWorkspaceDescription: (v: string) => void
  workspaceTemplates: { id: string; name: string; description: string; taskCount: number }[]
  workspaceTemplateId: string
  setWorkspaceTemplateId: (v: string) => void
  onCreateWorkspace: (e: FormEvent<HTMLFormElement>) => Promise<boolean>
  creatingWorkspace?: boolean
  languages: Record<string, string>
  settingsLang: string
  onLanguageChange: (lang: string) => void
  settingsColor: string
  onColorChange: (color: string) => void
  onFinish: () => void
}) {
  const [step, setStep] = useState<0 | 1 | 2>(0)

  const handleWorkspaceSubmit = async (e: FormEvent<HTMLFormElement>) => {
    const ok = await onCreateWorkspace(e)
    if (ok) setStep(2)
  }

  return (
    <div className="panel full-width onboarding-panel">
      <div className="onboarding-progress" aria-hidden="true">
        {[0, 1, 2].map(i => <span key={i} className={`onboarding-dot ${i === step ? 'active' : i < step ? 'done' : ''}`} />)}
      </div>

      {step === 0 && (
        <div className="onboarding-step">
          <EmptyState kind="sparkle" title={`Welcome to Taskly, ${firstname}`} description="Let's get you set up in under a minute — a workspace, a language, and a look you like." />
          <button type="button" className="primary-btn onboarding-next" onClick={() => setStep(1)}>
            Get started <ArrowRight size={14} />
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="onboarding-step">
          <p className="eyebrow"><FolderPlus size={13} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />Step 1 of 2</p>
          <h2>Create your first workspace</h2>
          <p className="onboarding-hint">A workspace is where your tasks and team live — personal or shared. You can always create more later.</p>
          <form className="stack-form" style={{ maxWidth: 380 }} onSubmit={handleWorkspaceSubmit}>
            <input value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} placeholder="Workspace name" required autoFocus disabled={creatingWorkspace} />
            <input value={workspaceDescription} onChange={e => setWorkspaceDescription(e.target.value)} placeholder="Description (optional)" disabled={creatingWorkspace} />
            {workspaceTemplates.length > 0 && (
              <div className="onboarding-field">
                <span>Start from a template (optional)</span>
                <div className="onboarding-template-grid">
                  <button
                    type="button"
                    className={`onboarding-template-card ${!workspaceTemplateId ? 'active' : ''}`}
                    onClick={() => setWorkspaceTemplateId('')}
                    disabled={creatingWorkspace}
                  >
                    Blank workspace
                  </button>
                  {workspaceTemplates.map(tpl => (
                    <button
                      key={tpl.id}
                      type="button"
                      className={`onboarding-template-card ${workspaceTemplateId === tpl.id ? 'active' : ''}`}
                      onClick={() => setWorkspaceTemplateId(tpl.id)}
                      disabled={creatingWorkspace}
                    >
                      {tpl.name}
                    </button>
                  ))}
                </div>
                {workspaceTemplateId && (
                  <p className="onboarding-hint" style={{ margin: '8px 0 0' }}>
                    {workspaceTemplates.find(tpl => tpl.id === workspaceTemplateId)?.description}
                  </p>
                )}
              </div>
            )}
            <button type="submit" className="primary-btn" disabled={creatingWorkspace}>
              {creatingWorkspace ? 'Creating workspace…' : <>Continue <ArrowRight size={14} /></>}
            </button>
          </form>
        </div>
      )}

      {step === 2 && (
        <div className="onboarding-step">
          <p className="eyebrow"><Languages size={13} strokeWidth={2} style={{ verticalAlign: -2, marginRight: 4 }} />Step 2 of 2</p>
          <h2>Make it yours</h2>
          <p className="onboarding-hint">Pick a language and an accent color — you can change these anytime in Settings.</p>
          <div className="onboarding-prefs">
            <label className="onboarding-field">
              <span>Language</span>
              <select value={settingsLang} onChange={e => onLanguageChange(e.target.value)}>
                {Object.entries(languages).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
            </label>
            <div className="onboarding-field">
              <span>Accent color</span>
              <div className="theme-previews">
                {COLORS.map(c => (
                  <div key={c} className={`theme-swatch ${settingsColor === c ? 'active' : ''} swatch-${c}`} onClick={() => onColorChange(c)} />
                ))}
              </div>
            </div>
          </div>
          <button type="button" className="primary-btn onboarding-next" onClick={onFinish}>
            <Check size={14} /> Take me to my dashboard
          </button>
        </div>
      )}

      {step > 0 && (
        <button type="button" className="onboarding-skip" onClick={onFinish}>
          <Sparkles size={12} /> Skip setup
        </button>
      )}
    </div>
  )
}
