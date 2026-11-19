import { createVuetify } from 'vuetify'
import { zhHans, en } from 'vuetify/locale'
import 'vuetify/styles'

/**
 * 星焰作业板管理后台 · 暖色主题
 * 令牌口径对齐「焰火益游管理员后台」（橙 #ff8a1f → #f4511e / 暖白纸感底）
 */
const warm = {
  dark: false,
  colors: {
    background: '#F7F6F4',
    surface: '#FFFFFF',
    'surface-bright': '#FFFFFF',
    'surface-light': '#F4F1EE',
    'surface-variant': '#FAF8F6',
    'on-surface-variant': '#4A423C',
    'on-background': '#1F1B18',
    'on-surface': '#1F1B18',
    primary: '#F4511E',
    'primary-darken-1': '#D63F0C',
    'primary-lighten-1': '#FF8A1F',
    secondary: '#8A8078',
    'secondary-darken-1': '#6B625B',
    accent: '#FF8A1F',
    success: '#2E9E63',
    'success-darken-1': '#248050',
    warning: '#E08A00',
    'warning-darken-1': '#B87200',
    error: '#E5484D',
    'error-darken-1': '#C23A3F',
    info: '#2F7FD1',
    'info-darken-1': '#2568AC',
  },
}

const warmDark = {
  dark: true,
  colors: {
    background: '#16130F',
    surface: '#211C17',
    'surface-bright': '#2A231C',
    'surface-light': '#2A231C',
    'surface-variant': '#262019',
    'on-surface-variant': '#D8CFC4',
    'on-background': '#F6F1EA',
    'on-surface': '#F6F1EA',
    primary: '#FF7A33',
    'primary-darken-1': '#E4581A',
    'primary-lighten-1': '#FFA366',
    secondary: '#9B8F83',
    'secondary-darken-1': '#8A8078',
    accent: '#FFA366',
    success: '#4EC486',
    'success-darken-1': '#3AA96E',
    warning: '#F0A83A',
    'warning-darken-1': '#CE8C22',
    error: '#FF6B6F',
    'error-darken-1': '#E04F53',
    info: '#6AA9E9',
    'info-darken-1': '#4A8FD4',
  },
}

export default createVuetify({
  locale: {
    locale: 'zhHans',
    fallback: 'en',
    messages: { zhHans, en },
  },
  theme: {
    defaultTheme: 'warm',
    themes: { warm, warmDark },
  },
  defaults: {
    VCard: { rounded: 'lg', elevation: 0, border: true },
    VBtn: { rounded: 'pill', elevation: 0 },
    VTextField: { variant: 'solo-filled', density: 'comfortable', flat: true, hideDetails: 'auto' },
    VTextarea: { variant: 'solo-filled', density: 'comfortable', flat: true, hideDetails: 'auto' },
    VSelect: { variant: 'solo-filled', density: 'comfortable', flat: true, hideDetails: 'auto' },
    VAutocomplete: { variant: 'solo-filled', density: 'comfortable', flat: true, hideDetails: 'auto' },
    VCombobox: { variant: 'solo-filled', density: 'comfortable', flat: true, hideDetails: 'auto' },
    VChip: { rounded: 'pill' },
    VListItem: { rounded: 'lg' },
    VTable: { density: 'comfortable' },
    VDataTable: { density: 'comfortable' },
    VTabs: { density: 'comfortable' },
    VSwitch: { color: 'primary', density: 'comfortable', hideDetails: 'auto' },
    VCheckbox: { color: 'primary', density: 'comfortable', hideDetails: 'auto' },
    VDialog: { scrim: 'rgba(40, 28, 18, 0.42)' },
    VSnackbar: { rounded: 'pill' },
    VProgressCircular: { color: 'primary' },
  },
})
