import { getNativeAppVersion, isNativeTaskly, openExternalUrl } from './nativeRuntime'

export type TasklyVersionInfo = {
  version: string
  versionCode: number
  releaseUrl: string
  notes?: string
}

const compareVersions = (left: string, right: string) => {
  const a = left.split('.').map((part) => Number(part) || 0)
  const b = right.split('.').map((part) => Number(part) || 0)
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i += 1) {
    const diff = (a[i] || 0) - (b[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

export const checkForTasklyUpdate = async () => {
  const response = await fetch('/taskly-version.json', { cache: 'no-store' })
  if (!response.ok) throw new Error('Could not check for Taskly updates')
  const latest = await response.json() as TasklyVersionInfo
  const currentVersion = await getNativeAppVersion()

  return {
    native: isNativeTaskly(),
    currentVersion,
    latest,
    updateAvailable: Boolean(currentVersion && compareVersions(latest.version, currentVersion) > 0),
  }
}

export const openTasklyUpdatePage = async (url: string) => openExternalUrl(url)
