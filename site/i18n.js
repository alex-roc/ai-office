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
    'nav.install': 'Instalar',
    'hero.title':
      'Ve, edita y mide tus agentes de Claude Code',
    'hero.lede':
      'ai-office convierte tus agentes, skills y comandos en una oficina en pixel art y un grafo vivo. Mira cómo está organizado tu equipo, recámbialo sin miedo y mide qué agentes y skills hacen de verdad el trabajo.',
    'hero.demo': 'Recorre la oficina de demostración',
    'hero.install':
      'Instálalo con un comando',
    'hero.fine':
      'Libre y de código abierto (MIT). Corre en tu máquina a partir de <code>~/.claude</code>; nada sale de ella.',
    'hero.alt':
      'La vista Sala: una planta isométrica en pixel art donde cada despacho agrupa a los agentes que citan la misma skill',
    'hero.caption':
      'La oficina de demostración. Cada despacho reúne a los agentes que comparten una skill o un comando; las figuras en gris nunca han recibido una tarea.',
    'census.title':
      'Mide lo que de verdad funciona',
    'census.lede':
      'Tus prompts dicen quién debería hacer qué. Tus transcripts dicen quién lo hizo. El censo cruza las dos cosas en unos segundos, incluso sobre gigabytes de sesiones, y las mismas cifras viven en la interfaz, cada una citando su fuente.',
    'census.n1.t': '6 de 14 agentes, nada en 90 días.',
    'census.n1.d': 'Escribiste sus prompts. Ninguna sesión de los últimos 90 días les ha delegado nada.',
    'census.n2.t':
      'La mitad de las skills, ociosas.',
    'census.n2.d': 'Sus descriptions se cargan igual en cada sesión y cuestan tokens.',
    'census.n3.t': 'Ratio activo: 32 %.',
    'census.n3.d':
      'Sube al usar lo que tienes o al jubilar lo que no usarás. Nunca por gastar más.',
    'census.n4.t': '41 promesas, 13 pruebas.',
    'census.n4.d':
      'Los agentes citan skills en su prompt. Los transcripts dicen qué citas se convirtieron en llamadas. Esa brecha es el producto.',
    'census.lang':
      'Cifras de la instalación de demostración que viene con el proyecto. Ejecuta <code>npx ai-office demo --lang es</code> para recorrerla.',
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
    'views.title':
      'Mira tu configuración tal como es',
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
    'edit.title':
      'Edítalo sin miedo',
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
      'Requiere Node 22.18 o posterior. Nada se escribe en tu configuración sin enseñarte antes el diff.',
    'install.plugin.t': 'Como plugin de Claude Code',
    'install.plugin.d':
      'Para la actividad en vivo. Los hooks los declara el plugin, así que tu <code>settings.json</code> no se toca. Añade el comando <code>/census</code> (y <code>/censo</code>).',
    'foot.d':
      'ai-office tiene licencia MIT y lo hace <a href="https://github.com/alex-roc">Alex Ojeda Copa</a>. Sin relación con Anthropic.',
    'nav.see':
      'Ver',
    'nav.edit':
      'Editar',
    'nav.measure':
      'Medir',
    'pillars.title':
      'Qué hace ai-office',
    'pillars.see.t':
      'Ver',
    'pillars.see.d':
      'Cada agente, skill y comando que has escrito, repartidos en despachos de gente que trabaja junta y en un grafo de quién llama a quién. Cada relación cita el archivo y la línea de donde sale.',
    'pillars.edit.t':
      'Editar',
    'pillars.edit.d':
      'Conecta un agente con una skill arrastrando, cambia su modelo o su color, jubila skills, archiva agentes y compón slash commands en un lienzo. Toda escritura enseña antes el diff.',
    'pillars.measure.t':
      'Medir',
    'pillars.measure.d':
      'Cruza lo que tus prompts prometen con lo que tus transcripts demuestran: a quién se delega, qué skills se invocan, cuánto contexto cuestan las ociosas y la actividad en vivo mientras ocurre.',
    'views.lede':
      'Dos vistas de los mismos archivos, que se alternan sin perder la selección. Nada es un diagrama dibujado a mano: cada despacho, balda y línea sale de algo escrito en <code>~/.claude</code>.',
    'install.npm.t':
      'Con un comando',
    'install.npm.d':
      'Sin instalar nada global. Abre la oficina en tu navegador.',
    'install.npm.c1':
      '# la oficina',
    'install.npm.c2':
      '# las cifras',
    'install.npm.c3':
      '# una oficina ficticia, para editar sin riesgo',
    'install.lang':
      'Interfaz y CLI en inglés y español: cambia con el botón EN/ES o con <code>--lang es</code>.',
    'census.term':
      '<span class="prompt">$</span> npx ai-office census --lang es\n\n  agentes              14   <b class="warn">6 no han trabajado en los últimos 90 días</b>\n  skills               28   <b class="warn">14 sin usar en los últimos 90 días</b>\n  comandos propios      8   4 ejecutados alguna vez\n\n  ratio activo  <span class="bar" data-ratio="0.32"><span></span></span>  32%\n  <span class="c">Sube al usar lo que tienes o al jubilar lo que no usarás.</span>\n\n  el grafo que ya escribiste, y el que existe\n  agente→skill citadas en su prompt   41  declaradas\n  agente→skill demostradas            13  en el historial',
    'foot.repo': 'Código en GitHub',
    'foot.issues': 'Reportar un problema',
  }

  const EN = {}
  const nodes = document.querySelectorAll('[data-i18n]')
  const alts = document.querySelectorAll('[data-i18n-alt]')
  for (const n of nodes) EN[n.dataset.i18n] = n.innerHTML
  for (const n of alts) EN[n.dataset.i18nAlt] = n.getAttribute('alt')
  const titles = { en: document.title, es: 'ai-office — ve, edita y mide tus agentes de Claude Code' }

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
  // Inglés primero: el español se elige (botón o ?lang=es), no se deduce del navegador.
  let lang = params.get('lang') || store.get() || 'en'
  if (lang !== 'es') lang = 'en'
  apply(lang)
  toggle.addEventListener('click', () => {
    lang = lang === 'es' ? 'en' : 'es'
    store.set(lang)
    apply(lang)
  })

  // La barra del censo: el único movimiento que no pide nadie, y solo una vez. Cambiar de idioma
  // reescribe el bloque del censo (y la barra con él): la nueva sale ya llena si la vieja lo estaba.
  let barraVista = false
  const prepararBarra = () => {
    const bar = document.querySelector('.bar')
    if (!bar) return
    bar.style.setProperty('--fill', bar.dataset.ratio)
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (barraVista || reduce || !('IntersectionObserver' in window)) {
      bar.classList.add('lleno')
      return
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        barraVista = true
        bar.classList.add('lleno')
        io.disconnect()
      }
    })
    io.observe(bar)
  }
  prepararBarra()
  toggle.addEventListener('click', prepararBarra)
})()
