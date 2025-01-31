import { checkForUpdates } from './updater'

export function addUpdateCheck() {
  // Check for updates when the app starts
  checkForUpdates()

  const checkUpdatesButton = document.getElementById('check-updates-button')
  if (checkUpdatesButton) {
    checkUpdatesButton.addEventListener('click', checkForUpdates)
  }
}
