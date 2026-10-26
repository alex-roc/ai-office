/*
 * Idioma de la página. El HTML ya trae el inglés (es lo que leen los buscadores y quien no tiene
 * JS); aquí solo vive el español. El inglés se captura del propio DOM al arrancar, así que no hay
 * dos copias del mismo texto que puedan desincronizarse.
 *
 * Además: la barra del censo se llena una sola vez, cuando entra en pantalla.
 */
;(() => {
  const ES = {
    "skip": "Saltar al contenido",
    "nav.see": "Ver",
    "nav.edit": "Editar",
    "nav.measure": "Medir",
    "nav.install": "Instalar",
    "hero.title": "Ve, edita y mide tu configuración de Claude Code",
    "hero.lede": "ai-office convierte todo aquello con lo que trabaja tu Claude Code en una oficina en pixel art, un grafo vivo y un registro. Mira cómo encaja, cámbialo sin miedo y descubre qué hace de verdad el trabajo.",
    "kind.agents": "Agentes",
    "kind.skills": "Skills",
    "kind.commands": "Slash commands",
    "kind.plugins": "Plugins",
    "kind.mcp": "Servidores MCP",
    "hero.demo": "Recorre la oficina de demostración",
    "hero.install": "Instálalo con un comando",
    "hero.fine": "Libre y de código abierto (MIT). Corre en tu máquina a partir de <code>~/.claude</code>; nada sale de ella.",
    "hero.alt": "La vista Sala: una planta isométrica en pixel art con despachos de agentes, un despacho para un plugin y una sala de servidores MCP",
    "hero.caption": "La oficina de demostración. Los despachos reúnen a los agentes que comparten una skill o un comando; un plugin tiene su propio despacho y cada servidor MCP un rack. Las figuras en gris nunca han recibido una tarea.",
    "pillars.title": "Qué hace ai-office",
    "pillars.see.t": "Ver",
    "pillars.see.d": "Cada agente, skill, slash command, plugin y servidor MCP, repartidos en una oficina y en un grafo de quién usa qué. Cada relación cita el archivo y la línea de donde sale, y cualquier archivo se abre ahí mismo.",
    "pillars.edit.t": "Editar",
    "pillars.edit.d": "Reescribe un prompt, un SKILL.md o un comando, asigna skills a agentes, cambia modelos y herramientas, crea nuevos, y activa o desactiva plugins y servidores MCP. Toda escritura enseña antes el diff.",
    "pillars.measure.t": "Medir",
    "pillars.measure.d": "Un registro de todo: usos, sesiones, tendencia de 12 semanas, grado, uso por proyecto y por herramienta MCP, y lo que cuestan en contexto las skills ociosas. Sobre todas tus sesiones o solo las de un proyecto.",
    "views.title": "Mira tu configuración tal como es",
    "views.lede": "Nada es un diagrama dibujado a mano: cada despacho, balda, rack y línea sale de algo escrito en tus archivos o registrado en tus transcripts.",
    "views.sala.alt": "La Sala con un agente seleccionado y su ficha abierta",
    "views.sala.t": "La Sala",
    "views.sala.d": "Una planta en pixel art isométrico. Los despachos no son temas inventados: salen de qué skills cita cada agente y qué comandos lo convocan, así que cada puerta lleva el nombre de una skill o un comando de verdad. Los plugins tienen su propio despacho y cada servidor MCP un rack en la sala de servidores.",
    "views.sala.d2": "La posición es dato. Una figura en gris nunca ha sido delegada, la altura de un lomo es lo asentada que está una skill y un rack apagado es un servidor al que nadie llama. Pulsa cualquier cosa y la ficha te dice qué es, qué ha hecho y qué archivo lo dice.",
    "views.plano.alt": "El Plano: un grafo de agentes, skills, comandos, piezas de plugins y servidores MCP",
    "views.plano.t": "El Plano",
    "views.plano.d": "El grafo de quién usa qué: agentes, skills, comandos, piezas de plugins (con anillo) y servidores MCP (hexágonos). Punteado lo que tus prompts declaran; sólido lo que tus transcripts demuestran.",
    "views.plano.d2": "Pulsa <kbd>/</kbd> para buscar cualquier cosa, <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> para cambiar de vista y <kbd>?</kbd> para la leyenda.",
    "edit.title": "Edítalo sin miedo",
    "edit.lede": "Todo lo que cambias pasa por la misma puerta: se enseña el diff antes de tocar el disco, se guarda una copia y queda una línea en un registro de auditoría. Nunca se borra nada.",
    "edit.alt": "El diff antes de guardar: dos skills añadidas al prompt de un agente",
    "edit.caption": "Dos skills asignadas a un agente: las líneas exactas que se van a escribir, antes de escribir nada.",
    "edit.a.t": "Agentes",
    "edit.a.d": "Description, prompt, modelo, color, herramientas, skills precargadas y las skills que cita. Archivar y restaurar. Crear nuevos.",
    "edit.b.t": "Skills",
    "edit.b.d": "Description (junto a las palabras suyas que nunca escribes), el propio SKILL.md y a qué agentes está asignada. Jubilarla, o crear una nueva.",
    "edit.c.t": "Slash commands",
    "edit.c.d": "Description, pista de argumentos y cuerpo, o componerlo en un lienzo de flujos: quién interviene, en qué orden, pasos en paralelo. Crear nuevos.",
    "edit.d.t": "Plugins y servidores MCP",
    "edit.d.d": "Activarlos o desactivarlos en el archivo de settings que elijas (los MCP por proyecto, como los guarda Claude Code). Los archivos de los plugins no se tocan nunca.",
    "census.title": "Mide lo que de verdad funciona",
    "census.lede": "Tus prompts dicen quién debería hacer qué. Tus transcripts dicen quién lo hizo. ai-office cruza las dos cosas en segundos, incluso sobre gigabytes de sesiones, y cada cifra cita su fuente.",
    "ledger.alt": "El Registro: una tabla ordenable de agentes, skills, comandos, plugins y servidores MCP con usos, grado y tendencia de 12 semanas, y la ficha de un servidor MCP",
    "ledger.caption": "El Registro: todo en una tabla ordenable, con la tendencia de 12 semanas. Aquí, la ficha de un servidor MCP: qué herramientas suyas se llaman de verdad y desde qué proyectos.",
    "census.term": "<span class=\"prompt\">$</span> npx @alex-roc/ai-office census --lang es\n\n  agentes              14   <b class=\"warn\">6 no han trabajado en los últimos 90 días</b>\n  skills               28   <b class=\"warn\">14 sin usar en los últimos 90 días</b>\n  comandos propios      8   4 ejecutados alguna vez\n\n  plugins       1 activo de 2 instalados · ~65 tokens\n  MCP           2 cargados · nunca llamado: postgres\n\n  ratio activo  <span class=\"bar\" data-ratio=\"0.36\"><span></span></span>  36%\n\n  agente→skill citadas en su prompt   40  declaradas\n  agente→skill demostradas            14  en el historial",
    "census.n1.t": "6 de 14 agentes, nada en 90 días.",
    "census.n1.d": "Escribiste sus prompts. Ninguna sesión de los últimos 90 días les ha delegado nada.",
    "census.n2.t": "La mitad de las skills, ociosas.",
    "census.n2.d": "Sus descriptions se cargan igual en cada sesión y cuestan tokens.",
    "census.n3.t": "Un servidor MCP al que nadie llama.",
    "census.n3.d": "Configurado, cargado y sin un solo uso. Desactívalo en los proyectos que no lo necesitan.",
    "census.n4.t": "40 promesas, 14 pruebas.",
    "census.n4.d": "Los agentes citan skills en su prompt. Los transcripts dicen qué citas se convirtieron en llamadas. Esa brecha es el producto.",
    "census.lang": "Cifras de la instalación de demostración que viene con el proyecto. Ejecuta <code>npx @alex-roc/ai-office demo --lang es</code> para recorrerla.",
    "layers.title": "El grafo ya está escrito, en prosa",
    "layers.lede": "Los agentes se dicen a sí mismos «lee primero la skill style-guide». Los comandos nombran a los agentes que convocan. Nada de eso es un campo estructurado, así que ninguna herramienta lo ve. ai-office lo extrae, con el archivo y la línea que justifican cada relación, y lo superpone a lo que tus transcripts demuestran.",
    "layers.a.t": "Disponible",
    "layers.a.s": "las skills instaladas",
    "layers.a.d": "Cualquiera puede invocarla, si el modelo lo decide.",
    "layers.b.t": "Encomendada",
    "layers.b.s": "prosa del prompt del agente",
    "layers.b.d": "Su prompt se lo manda. Nadie lo garantiza.",
    "layers.c.t": "Precargada",
    "layers.c.s": "del frontmatter",
    "layers.c.d": "Se carga siempre, cueste lo que cueste.",
    "layers.d.t": "Acreditada",
    "layers.d.s": "tus transcripts",
    "layers.d.d": "Lo hizo, N veces, la última tal día. Esta capa manda: es la única respaldada por hechos.",
    "live.title": "Mira a tus agentes fichar",
    "live.d": "Con los hooks instalados, la oficina se anima mientras trabajas en otra ventana: los agentes se materializan al ser delegados y el lomo de una skill se ilumina al invocarse. Cada evento deja rastro permanente en las fichas.",
    "scope.title": "Toda tu configuración, o solo un proyecto",
    "scope.lede": "Configurable, para que enseñe lo que necesitas y nunca se sature.",
    "scope.a.t": "Elige el ámbito",
    "scope.a.d": "Nivel de usuario, o un proyecto: lo que de verdad carga una sesión ahí, con las piezas del proyecto que tapan a las del usuario marcadas como tales. El uso se mide entonces solo con las sesiones de ese proyecto.",
    "scope.b.t": "Elige qué se dibuja",
    "scope.b.d": "Muestra u oculta agentes, skills, comandos, plugins y servidores MCP en la Sala y el Plano. El Registro lo lista siempre todo, con sus propios filtros.",
    "scope.c.t": "En inglés o en español",
    "scope.c.d": "Interfaz y CLI en los dos idiomas. Cambia con el botón EN/ES, <code>--lang es</code> o la opción de idioma del plugin.",
    "principles.title": "Principios",
    "p1.t": "Nada sale de tu máquina",
    "p1.d": "Sin servidor, sin telemetría, sin cuenta, sin red. Un daemon local escucha solo en 127.0.0.1, tras un token que cambia en cada arranque. Los secretos de los MCP no se enseñan nunca: solo los nombres de sus variables.",
    "p2.t": "Todo indicador cita su fuente",
    "p2.d": "Si una cifra no puede decir de qué archivo y campo sale, no se muestra. Por eso no hay coste en tokens de los servidores MCP: no se puede saber sin conectarse a ellos.",
    "p3.t": "Ninguna cifra mejora por gastar más",
    "p3.d": "El grado satura: el uso nº 50 no vale más que el 3.º, y caduca tras 90 días sin uso.",
    "install.title": "Instalar",
    "install.lede": "Requiere Node 22.18 o posterior. Nada se escribe en tu configuración sin enseñarte antes el diff.",
    "install.npm.t": "Con un comando",
    "install.npm.d": "Sin instalar nada global. Ejecútalo dentro de un proyecto para abrir el ámbito de ese proyecto.",
    "install.npm.c1": "# la oficina",
    "install.npm.c2": "# las cifras",
    "install.npm.c3": "# una oficina ficticia, para editar sin riesgo",
    "install.plugin.t": "Como plugin de Claude Code",
    "install.plugin.d": "Para la actividad en vivo. Los hooks los declara el plugin, así que tu <code>settings.json</code> no se toca. Añade el comando <code>/census</code> (y <code>/censo</code>).",
    "foot.d": "ai-office tiene licencia MIT y lo hace <a href=\"https://github.com/alex-roc\">Alex Ojeda Copa</a>. Sin relación con Anthropic.",
    "foot.repo": "Código en GitHub",
    "foot.issues": "Reportar un problema",
  }


  const EN = {}
  const nodes = document.querySelectorAll('[data-i18n]')
  const alts = document.querySelectorAll('[data-i18n-alt]')
  for (const n of nodes) EN[n.dataset.i18n] = n.innerHTML
  for (const n of alts) EN[n.dataset.i18nAlt] = n.getAttribute('alt')
  const titles = { en: document.title, es: 'ai-office — ve, edita y mide tu configuración de Claude Code' }

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
