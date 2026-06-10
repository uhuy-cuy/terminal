import { getDisplayPath, getGitBranch } from '../utils/commands'

export default function TerminalPrompt({ cwd, home, gitBranch, realMode }) {
  const displayPath = getDisplayPath(cwd, home)
  const branch = gitBranch ?? getGitBranch(cwd, { realMode, gitBranch })

  return (
    <div className="tw-prompt">
      <span className="tw-seg tw-seg-user">@tahirwiyan</span>
      <span className="tw-seg tw-seg-path">
        <span className="tw-icon">{realMode ? 'C:' : '~'}</span>
        {displayPath}
      </span>
      {branch && (
        <span className="tw-seg tw-seg-git">
          <span className="tw-icon">⎇</span>
          {branch}
        </span>
      )}
      <span className="tw-seg tw-seg-shell">
        <span className="tw-icon">❯</span>
        {realMode ? 'pwsh' : 'sh'}
      </span>
    </div>
  )
}
