// Follows the system light/dark setting with the Untitled UI ".dark-mode" class.
const mq = window.matchMedia('(prefers-color-scheme: dark)')
const apply = (): void => {
  document.documentElement.classList.toggle('dark-mode', mq.matches)
}
apply()
mq.addEventListener('change', apply)
