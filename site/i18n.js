/*
 * Idioma de la página. El HTML ya trae el inglés (es lo que leen los buscadores y quien no tiene
 * JS); aquí solo vive el español. El inglés se captura del propio DOM al arrancar, así que no hay
 * dos copias del mismo texto que puedan desincronizarse.
 *
 * Además: la barra del censo se llena una sola vez, cuando entra en pantalla.
 */
;(() => {
  const ES = {
    skip: 'Saltar al contenido',
    'nav.census': 'Censo',
    'nav.views': 'Vistas',
    'nav.install': 'Instalar',
    'hero.title': '¿Qué mitad de tu configuración de Claude Code no usas nunca?',
    'hero.lede':
      'ai-office lee tus agentes, skills y comandos, los cruza con lo que de verdad ha pasado en tus sesiones y te enseña las dos cosas juntas: el organigrama que escribiste y el que existe.',
    'hero.demo': 'Recorre la oficina de demostración',
    'hero.install': 'Instálalo en tu configuración',
    'hero.fine':
      'Libre y de código abierto (MIT). Corre en tu máquina, lee <code>~/.claude</code> y no envía nada a ningún sitio.',
    'hero.alt':
      'La vista Sala: una planta isométrica en pixel art donde cada despacho agrupa a los agentes que citan la misma skill',
    'hero.caption':
      'La oficina de demostración. Cada despacho reúne a los agentes que citan la misma skill; las figuras en gris nunca han recibido una tarea.',
    'census.title': 'Un comando, las cifras incómodas',
    'census.lede':
      'Pasa el censo sobre tu propia instalación. Tarda unos segundos, incluso sobre gigabytes de transcripts.',
    'census.n1.t': '6 de 14 agentes, nada en 90 días.',
    'census.n1.d': 'Escribiste sus prompts. Ninguna sesión de los últimos 90 días les ha delegado nada.',
    'census.n2.t': 'La mitad de las skills, sin estrenar.',
    'census.n2.d': 'Sus descriptions se cargan igual en cada sesión y cuestan tokens.',
    'census.n3.t': 'Ratio activo: 32 %.',
    'census.n3.d':
      'Sube al usar lo que tienes o al jubilar lo que no usarás. Nunca por gastar más.',
    'census.n4.t': '41 promesas, 13 pruebas.',
    'census.n4.d':
      'Los agentes citan skills en su prompt. Los transcripts dicen qué citas se convirtieron en llamadas. Esa brecha es el producto.',
    'census.lang':
      'El CLI y la interfaz hablan español. Las cifras de arriba salen de la instalación de demostración que viene con el proyecto.',
    'layers.title': 'El grafo ya está escrito, en prosa',
    'layers.lede':
      'Los agentes se dicen a sí mismos «lee primero la skill style-guide». Los comandos nombran a los agentes que convocan. Nada de eso es un campo estructurado, así que ninguna herramienta lo ve. ai-office lo extrae, con el archivo y la línea que justifican cada relación, y lo superpone a lo que tus transcripts demuestran.',
    'layers.a.t': 'Disponible',
    'layers.a.s': 'las skills instaladas',
    'layers.a.d': 'Cualquiera puede invocarla, si el modelo lo decide.',
    'layers.b.t': 'Encomendada',
    'layers.b.s': 'prosa del prompt del agente',
    'layers.b.d': 'Su prompt se lo manda. Nadie lo garantiza.',
    'layers.c.t': 'Precargada',
    'layers.c.s': 'del frontmatter',
    'layers.c.d': 'Se carga siempre, cueste lo que cueste.',
    'layers.d.t': 'Acreditada',
    'layers.d.s': 'tus transcripts',
    'layers.d.d':
      'Lo hizo, N veces, la última tal día. Esta capa manda: es la única respaldada por hechos.',
    'views.title': 'Dos maneras de mirar la misma oficina',
    'views.sala.alt': 'Detalle de un despacho en la vista Sala',
    'views.sala.t': 'La Sala',
    'views.sala.d':
      'Una planta en pixel art isométrico. Los despachos no son temas inventados: salen de qué skills cita cada agente y qué comandos lo convocan, así que cada puerta lleva el nombre de una skill o un comando de verdad y te dice por qué esas personas lo comparten.',
    'views.sala.d2':
      'La posición es dato. Una figura en gris nunca ha sido delegada. La altura de un lomo es lo asentada que está una skill; un lomo en blanco es una skill que nadie ha abierto. El archivo de las skills que cita media planta está enfrente del depósito de las que no reclama nadie.',
    'views.plano.alt': 'La vista Plano: un grafo de fuerzas con agentes, skills y comandos',
    'views.plano.t': 'El Plano',
    'views.plano.d':
      'El grafo con todas las capas a la vez. Punteado lo que tus prompts declaran; sólido lo que tus transcripts demuestran. Selecciona cualquier cosa y la ficha lateral cita el archivo y la línea de cada afirmación.',
    'views.plano.d2':
      'Pulsa <kbd>/</kbd> para buscar cualquier agente, skill o comando, y <kbd>?</kbd> para la leyenda y los atajos.',
    'edit.title': 'Cámbialo sin miedo',
    'edit.lede':
      'Todo lo que editas pasa por la misma puerta: se enseña el diff antes de tocar el disco, se guarda una copia y queda una línea en un registro de auditoría. Nunca se borra nada.',
    'edit.alt': 'El lienzo de flujos componiendo un slash command, con la vista previa exacta del Markdown',
    'edit.a.t': 'Dibuja una relación.',
    'edit.a.d':
      'Arrastra de un agente a una skill en el Plano y la cita queda escrita en su prompt.',
    'edit.b.t': 'Jubila una skill.',
    'edit.b.d':
      'Un clic pone <code>disable-model-invocation</code>. Es reversible, y es la manera más rápida de subir tu ratio activo.',
    'edit.c.t': 'Compón un slash command.',
    'edit.c.d':
      'Elige quién interviene, en qué orden y qué consulta. Los pasos de la misma fase corren en paralelo, y la vista previa es el Markdown exacto que se va a escribir.',
    'edit.d.t': 'Archiva un agente.',
    'edit.d.d': 'Se aparta, no va a la papelera, y vuelve con un clic.',
    'live.title': 'Mira a tus agentes fichar',
    'live.d':
      'Con los hooks instalados, la oficina se anima mientras trabajas en otra ventana: los agentes se materializan al ser delegados y el lomo de una skill se ilumina al invocarse. A diferencia de un visor de sesiones, cada evento deja rastro permanente en las fichas: ver trabajar cambia lo que las cosas son.',
    'principles.title': 'Principios',
    'p1.t': 'Nada sale de tu máquina',
    'p1.d':
      'Sin servidor, sin telemetría, sin cuenta, sin red. Lee <code>~/.claude</code>, y un daemon local escucha solo en 127.0.0.1, tras un token que cambia en cada arranque.',
    'p2.t': 'Todo indicador cita su fuente',
    'p2.d':
      'Si una cifra no puede decir de qué archivo y campo sale, no se muestra. Hasta documentamos la métrica que probamos y descartamos porque los datos no la sostenían.',
    'p3.t': 'Ninguna cifra mejora por gastar más',
    'p3.d':
      'El grado de una skill satura: el uso nº 50 no vale más que el 3.º, y caduca tras 90 días sin uso.',
    'install.title': 'Instalar',
    'install.lede':
      'Requiere Node 22.16 o posterior. Nada se escribe en tu configuración sin enseñarte antes el diff.',
    'install.plugin.t': 'Como plugin de Claude Code',
    'install.plugin.d':
      'Recomendado. Los hooks los declara el plugin, así que tu <code>settings.json</code> no se toca. Añade el comando <code>/censo</code>.',
    'install.src.t': 'Desde el código',
    'install.src.d': 'Clónalo, pasa el censo, abre la oficina.',
    'install.src.c1': '# las cifras',
    'install.src.c2': '# la oficina, en tu navegador',
    'install.src.c3': '# una oficina ficticia, para editar sin riesgo',
    'foot.d':
      'ai-office tiene licencia MIT y lo hace <a href="https://github.com/alex-roc">Alex Ojeda Copa</a>. Sin relación con Anthropic.',
    'foot.repo': 'Código en GitHub',
    'foot.issues': 'Reportar un problema',
  }

  const EN = {}
  const nodes = document.querySelectorAll('[data-i18n]')
  const alts = document.querySelectorAll('[data-i18n-alt]')
  for (const n of nodes) EN[n.dataset.i18n] = n.innerHTML
  for (const n of alts) EN[n.dataset.i18nAlt] = n.getAttribute('alt')
  const titles = { en: document.title, es: 'ai-office — la configuración de Claude Code que escribiste y la que usas' }

  const store = {
    get: () => {
      try {
        return localStorage.getItem('ai-office-lang')
      } catch {
        return null
      }
    },
    set: (v) => {
      try {
        localStorage.setItem('ai-office-lang', v)
      } catch {
        /* sin almacenamiento: el idioma dura lo que la pestaña */
      }
    },
  }

  const toggle = document.querySelector('[data-lang-toggle]')
  const apply = (lang) => {
    const dict = lang === 'es' ? ES : EN
    for (const n of nodes) {
      const v = dict[n.dataset.i18n]
      if (v !== undefined) n.innerHTML = v
    }
    for (const n of alts) {
      const v = dict[n.dataset.i18nAlt]
      if (v !== undefined) n.setAttribute('alt', v)
    }
    document.documentElement.lang = lang
    document.title = titles[lang]
    toggle.textContent = lang === 'es' ? 'EN' : 'ES'
    toggle.setAttribute('aria-label', lang === 'es' ? 'Read in English' : 'Leer en español')
  }

  const params = new URLSearchParams(location.search)
  let lang =
    params.get('lang') ||
    store.get() ||
    ((navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en')
  if (lang !== 'es') lang = 'en'
  apply(lang)
  toggle.addEventListener('click', () => {
    lang = lang === 'es' ? 'en' : 'es'
    store.set(lang)
    apply(lang)
  })

  // La barra del censo: el único movimiento que no pide nadie, y solo una vez.
  const bar = document.querySelector('.bar')
  if (bar) {
    bar.style.setProperty('--fill', bar.dataset.ratio)
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || !('IntersectionObserver' in window)) bar.classList.add('lleno')
    else {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          bar.classList.add('lleno')
          io.disconnect()
        }
      })
      io.observe(bar)
    }
  }
})()
