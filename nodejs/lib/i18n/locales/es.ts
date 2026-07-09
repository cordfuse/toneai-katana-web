// Spanish translations. Keys mirror the t() calls in components; the
// English fallback embedded at each call site is what gets shown if a key
// is missing here. Add missing keys as needed.
const es: Record<string, string> = {
  // header
  'header.openChats':         'Abrir chats',
  'header.newChat':           'Nuevo chat',
  'header.deleteChat':        'Eliminar chat',
  'header.downloadChat':      'Descargar chat',
  'header.settings':          'Configuración',
  // sidebar
  'sidebar.chats':            'Chats',
  'sidebar.searchPlaceholder': 'Buscar chats…',
  'sidebar.noConversations':  'Aún no hay conversaciones',
  'sidebar.closeSidebar':     'Cerrar barra lateral',
  // composer
  'composer.placeholder':     'Escribe un mensaje…',
  'composer.send':            'Enviar',
  'composer.stop':            'Detener',
  'composer.attach':          'Adjuntar',
  'composer.attachFile':      'Adjuntar archivo',
  'composer.camera':          'Cámara',
  'composer.photos':          'Fotos',
  'composer.documents':       'Documentos',
  'composer.voiceInput':      'Entrada de voz',
  'composer.voiceInputStop':  'Detener grabación',
  'composer.voiceOutputOn':   'Voz: activada — pulsa para silenciar',
  'composer.voiceOutputOff':  'Voz: desactivada — pulsa para hablar respuestas',
  'composer.webSearchOn':     'Búsqueda web: ACTIVA — pulsa para desactivar',
  'composer.webSearchOff':    'Búsqueda web: desactivada — pulsa para activar',
  // settings
  'settings.title':           'Configuración',
  'settings.close':           'Cerrar',
  'settings.theme':           'Tema',
  'settings.language':        'Idioma',
  'settings.systemPrompt':    'Indicación del sistema',
  'settings.temperature':     'Temperatura',
  'settings.clearOverride':   'Borrar anulación → usar valor por defecto',
  'settings.data':            'Datos',
  'settings.import':          'Importar…',
  'settings.export':          'Exportar…',
  'settings.reset':           'Restablecer',
  'settings.delete':          'Eliminar',
  'settings.cancel':          'Cancelar',
  // status
  'status.typing':            'escribiendo…',
  'status.streaming':         'transmitiendo…',
  'status.toolRunning':       'ejecutando',
}
export default es
