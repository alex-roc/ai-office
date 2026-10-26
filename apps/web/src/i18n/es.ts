import type { en } from './en.ts'

/** Catálogo en español. Tipado contra `en`: no puede faltar ni sobrar ninguna clave. */
export const es: Record<keyof typeof en, string> = {
  // --- Vistas, cabecera ---------------------------------------------------------------------
  'view.office': 'Sala',
  'view.blueprint': 'Plano',
  'header.view.title': '{view} (tecla {key})',
  'header.edit.on': 'editando',
  'header.edit.off': 'editar grafo',
  'header.edit.title.blueprint':
    'Arrastra de un agente a una skill para escribir la relación en su prompt',
  'header.edit.title.office': 'Solo disponible en el Plano: cambia de vista para editar el grafo',
  'header.newFlow': 'nuevo flujo',
  'header.newFlow.title': 'Componer un slash command',
  'header.search': 'buscar',
  'header.search.title': 'Buscar (tecla /)',
  'header.fit': 'encuadrar',
  'header.fit.title': 'Encuadrar todo (tecla 0)',
  'header.help.title': 'Ayuda y atajos (tecla ?)',
  'header.lang': 'Idioma',
  'header.lang.title': 'Cambiar el idioma de la interfaz',

  'live.disconnected': 'sin conexión',
  'live.disconnected.title.stuck':
    'El WebSocket de eventos en vivo no se conecta. Si acabas de reiniciar el daemon, pega el enlace nuevo (con su #t=…) en esta pestaña.',
  'live.disconnected.title':
    'Sin conexión con el daemon: no llegan eventos en vivo. Se reintenta solo, cada vez más despacio.',
  'live.connected': 'en vivo',
  'live.connected.title':
    'Eventos en vivo de los hooks de Claude Code, por WebSocket desde el daemon local.',
  'live.sessions_one': '{n} sesión en curso',
  'live.sessions_other': '{n} sesiones en curso',

  'read.agents': 'agentes',
  'read.agents.src': 'Archivos *.md en {path}',
  'read.agents.unused': 'sin estrenar',
  'read.agents.unused.src': 'Agentes sin una sola delegación en los {transcripts}',
  'read.skills': 'skills',
  'read.skills.src': 'Carpetas */SKILL.md en {path}',
  'read.skills.unused': 'sin usar',
  'read.skills.unused.src': 'Skills que no aparecen invocadas en los {transcripts}',
  'read.retired': 'jubiladas',
  'read.retired.src': 'Skills con disable-model-invocation: true en su SKILL.md',
  'read.commands': 'comandos',
  'read.commands.src': 'Archivos *.md en {path}',
  'read.commands.unused': 'sin ejecutar',
  'read.commands.unused.src': 'Comandos que no figuran tecleados en {root}/history.jsonl',
  'read.ratio': 'ratio activo',
  'read.ratio.src':
    'Skills con uso reciente (en práctica o acreditadas; el grado caduca a los 90 días) sobre el total. Fuente: {transcripts}',
  'read.declared': 'declaradas',
  'read.declared.src':
    'Pares agente→skill que el prompt de un agente manda leer (capa declarada, agents/*.md)',
  'read.proven': 'demostradas',
  'read.proven.src': 'Pares agente→skill con invocaciones reales en los {transcripts}',
  'src.transcripts': 'transcripts de {root}/projects{window}',
  'src.window.all': ', todo el historial',
  'src.window.days_one': ', último día',
  'src.window.days_other': ', últimos {n} días',

  // --- Aplicación ---------------------------------------------------------------------------
  'app.loading': 'leyendo ~/.claude…',
  'app.loading.demo': 'abriendo la oficina de demostración…',
  'app.error.title': 'No se pudo leer tu configuración',
  'app.error.step1': 'Arranca el daemon: `ai-office`, o `pnpm dev` dentro del repo.',
  'app.error.step2':
    'Abre el enlace que imprime, que acaba en `#t=…`: lleva el token. También puedes pegarlo en esta pestaña; se recargará sola.',
  'app.error.step3':
    'El token cambia en cada arranque del daemon, así que un enlace viejo deja de valer.',
  'app.retry': 'Reintentar',
  'app.retrying': 'Reintentando…',
  'band.retry': 'reintentar',
  'band.retrying': 'reintentando…',
  'band.scan_one': '{n} archivo no se pudo leer y falta en lo que ves',
  'band.scan_other': '{n} archivos no se pudieron leer y faltan en lo que ves',
  'demo.band':
    'Demo de solo lectura con una instalación ficticia. Los destellos reproducen lo que consta en sus transcripts.',
  'demo.install': 'Instálalo en la tuya',
  'demo.error':
    'Esto es una demo de solo lectura con una instalación ficticia. Instala ai-office para editar tu propia configuración: todo cambio enseña el diff antes de escribir.',
  'toast.agentOnly':
    'Solo un agente tiene un prompt donde escribir la relación. Arrastra desde un agente.',
  'toast.alreadyMentions': '{agent} ya menciona {skill} en su prompt.',
  'toast.flowSaved': 'Guardado el comando /{name}.',
  'toast.archived': 'Agente archivado. Puedes restaurarlo desde la ficha vacía.',
  'toast.unarchived': 'Agente restaurado.',
  'toast.saved': 'Guardado: {title}.',
  'toast.notDrawn.office':
    'La Sala no dibuja esto (los agentes archivados, por ejemplo). Mira su ficha a la derecha.',
  'toast.notDrawn.current':
    'La vista actual no dibuja esto (los agentes archivados, por ejemplo). Mira su ficha a la derecha.',
  'diff.title.flow': '/{name} · {steps}',
  'diff.title.consult': '{agent} consultará {skill}',
  'diff.title.color': 'color de {name}',
  'diff.title.model': 'modelo de {name}',
  'diff.title.archive': 'archivar {name}',
  'diff.title.restore': 'restaurar {name}',
  'diff.title.retire': 'jubilar {name}',
  'diff.title.unretire': 'reactivar {name}',

  // --- Contadores y tiempo ------------------------------------------------------------------
  'count.steps_one': '{n} paso',
  'count.steps_other': '{n} pasos',
  'count.uses_one': '{n} uso',
  'count.uses_other': '{n} usos',
  'count.delegations_one': '{n} delegación',
  'count.delegations_other': '{n} delegaciones',
  'count.skillsUsed_one': '{n} skill usada',
  'count.skillsUsed_other': '{n} skills usadas',
  'count.skills_one': '{n} skill',
  'count.skills_other': '{n} skills',
  'time.never': 'nunca',

  'grade.unused': 'sin estrenar',
  'grade.tried': 'estrenada',
  'grade.practicing': 'en práctica',
  'grade.certified': 'acreditada',

  'kind.agent': 'agente',
  'kind.skill': 'skill',
  'kind.command': 'comando',
  'kind.mcp': 'servidor MCP',
  'kind.main': 'hilo principal',
  'kind.live': 'en directo',
  'main.thread': 'hilo principal (tú)',

  // --- Salas (despachos) --------------------------------------------------------------------
  'room.hub': 'vestíbulo',
  'room.hub.reason': 'El hilo principal, el archivo de lo que usa media planta y el depósito.',
  'room.unlinked': 'sin vínculos',
  'room.reason.skill.one': 'Cita `{name}` en su prompt y no la comparte con nadie.',
  'room.reason.skill.all': 'Los {total} citan `{name}` en su prompt.',
  'room.reason.skill.some': '{cuantos} de los {total} citan `{name}` en su prompt.',
  'room.reason.command.one': 'Lo convoca /{name} y ningún otro comando.',
  'room.reason.command.all': 'Los {total} son convocados por /{name}.',
  'room.reason.command.some': '{cuantos} de los {total} son convocados por /{name}.',
  'room.reason.loose.one': 'Su prompt no cita ninguna skill y ningún comando lo convoca.',
  'room.reason.loose.many': 'No comparten ninguna skill ni ningún comando.',

  // --- Sala (Pixi) --------------------------------------------------------------------------
  'tip.agent.never': '{name} · nunca delegado',
  'tip.agent': '{name} · {delegations} · {grade}',
  'tip.skill.never': '{name} · nunca usada',
  'tip.skill': '{name} · {uses} · {grade}',
  'tip.skill.owner': ' · sobre todo {owner}',
  'tip.command.run': '/{name} · ejecutado',
  'tip.command.never': '/{name} · nunca ejecutado',
  'tip.main': '{name} · {skills}',

  'office.loading': 'Abriendo la oficina…',
  'office.legend.summary': 'cómo leer la sala',
  'office.legend.grey':
    '**Persona en gris**: agente al que nunca has delegado. En color: ya ha trabajado.',
  'office.legend.spine':
    '**Alto del lomo**: grado de la skill (sin estrenar, estrenada, en práctica, acreditada). El color es el agente que más la usa.',
  'office.legend.nolabel': '**Lomo sin tejuelo dorado**: skill que nunca se ha usado.',
  'office.legend.shelves':
    '**Archivo común** (balda alta del vestíbulo): skills que cita media planta. **Depósito** (balda baja): skills que no cita ningún agente.',
  'office.legend.card': '**Tarjeta con chincheta roja**: comando que se ha ejecutado; gris, nunca.',
  'office.legend.plate':
    '**Placa de la puerta**: pasa el ratón para ver por qué esos agentes comparten despacho.',

  // --- Ayuda y bienvenida -------------------------------------------------------------------
  'help.title': 'Ayuda',
  'help.keys.title': 'Atajos de teclado',
  'help.key.office': 'ver la Sala',
  'help.key.blueprint': 'ver el Plano',
  'help.key.search':
    'buscar un agente, skill, comando, plugin o servidor MCP y llevar la vista hasta él',
  'help.key.zoom': 'acercar o alejar',
  'help.key.fit': 'encuadrar todo',
  'help.key.esc': 'cerrar el diálogo abierto o quitar la selección',
  'help.key.help': 'abrir esta ayuda',
  'help.keys.note':
    'Los atajos no actúan mientras escribes en un campo de texto ni con un diálogo abierto.',
  'help.office.title': 'Cómo leer la Sala',
  'help.office.room':
    'Cada **despacho** agrupa agentes que citan las mismas skills o que convocan los mismos comandos; la placa de la puerta dice por qué.',
  'help.office.grey':
    '**Persona en gris**: agente al que nunca has delegado. En color: ya ha trabajado.',
  'help.office.spine':
    '**Lomo** de una skill: su alto es el grado (sin estrenar, estrenada, en práctica, acreditada) y su color, el agente que más la usa. Sin tejuelo dorado: nunca usada.',
  'help.office.shelves':
    '**Archivo común**: skills que cita media planta. **Depósito**: skills que no cita ningún agente.',
  'help.office.card':
    '**Tarjeta** clavada en la mampara: un comando. Chincheta roja, se ha ejecutado; gris, nunca.',
  'help.blueprint.title': 'Cómo leer el Plano',
  'help.blueprint.lines':
    'Línea **punteada**: lo que tus prompts dicen que debería pasar. Línea **sólida verde**: lo que los transcripts demuestran que pasó. La distancia entre ambas es el trabajo pendiente.',
  'help.blueprint.shapes':
    'Círculo: agente. Cuadrado: skill. Rectángulo: comando. Relleno vacío: nunca usado.',
  'help.blueprint.edit':
    '**editar grafo** (solo en el Plano): arrastra de un agente a una skill para escribir esa relación en su prompt. Siempre se enseña el diff antes de tocar el archivo.',
  'help.ok': 'Entendido',
  'welcome.aria': 'Bienvenida',
  'welcome.title': 'Esto es tu configuración de Claude Code, cruzada con lo que de verdad pasó',
  'welcome.office':
    '**Sala**: una oficina donde cada agente es una persona, cada skill un lomo en una balda y cada comando una tarjeta. Lo gris es lo que nunca has usado.',
  'welcome.blueprint':
    '**Plano**: el mismo catálogo como grafo. Punteado = lo que tus prompts dicen; sólido = lo que los transcripts demuestran.',
  'welcome.details':
    '**Ficha** (a la derecha): pulsa cualquier cosa para ver qué dice de sí misma, qué ha hecho y de qué archivo sale cada dato. Desde ahí puedes leer el archivo y editarlo, siempre con diff.',
  'welcome.shortcuts': 'Ver atajos',

  // --- Panel de detalle ---------------------------------------------------------------------
  'detail.aria': 'Ficha',
  'detail.aria.of': 'Ficha de {name}',
  'detail.explain.office':
    'Cada figura, lomo y tarjeta de la Sala sale de un archivo tuyo. Una persona en gris es un agente al que nunca has delegado; el alto de un lomo es el grado de la skill y un lomo sin tejuelo dorado es una skill que nunca se ha usado. Pulsa cualquier cosa para ver su ficha.',
  'detail.explain.blueprint':
    'Cada línea del plano sale de un archivo tuyo. Las punteadas son lo que tus prompts dicen que debería pasar; las sólidas, lo que los transcripts demuestran que pasó.',
  'detail.reads': 'lo que se lee',
  'detail.archivedList': 'archivados ({n})',
  'detail.restore': 'restaurar',
  'detail.archivedNote':
    'Viven en la carpeta de archivados de `agents/` y no se dibujan en la Sala ni en el Plano.',
  'detail.missing': 'Esta entidad aparece en el historial pero ya no existe en disco.',
  'detail.archivedTag': ' · archivado',
  'detail.service': 'hoja de servicios',
  'detail.mainSkills': 'skills que ha usado',
  'detail.uses': 'usos registrados',
  'detail.sessionsProjects': 'sesiones · proyectos',
  'detail.lastUsed': 'última vez',
  'detail.grade': 'grado',
  'detail.edit': 'editar',
  'detail.color': 'color',
  'detail.color.none': 'sin asignar',
  'detail.model': 'modelo',
  'detail.model.inherit': 'heredado',
  'detail.archive.button': 'archivar este agente',
  'detail.archive.note':
    'Archivar lo mueve a la carpeta de archivados. No se borra nada y se puede deshacer.',
  'detail.archived': 'archivado',
  'detail.unarchive.button': 'restaurar este agente',
  'detail.unarchive.note':
    'Lo devuelve a `agents/`. Mientras esté archivado no aparece en la Sala.',
  'detail.retire.button': 'jubilar esta skill',
  'detail.unretire.button': 'reactivar esta skill',
  'detail.retire.note':
    'Jubilar escribe `disable-model-invocation`: deja de competir por la atención del modelo, tú puedes seguir invocándola a mano, y sube tu ratio activo.',
  'detail.definition': 'definición',
  'detail.def.tools': 'tools',
  'detail.def.tools.all': 'todas',
  'detail.def.preloaded': 'skills precargadas',
  'detail.def.promptSize': 'tamaño del prompt',
  'detail.def.tokens': '~{n} tokens',
  'detail.def.description': 'description',
  'detail.def.descriptionTokens': '~{n} tokens por sesión',
  'detail.def.body': 'cuerpo',
  'detail.def.bodyTokens': '~{n} tokens al invocarla',
  'detail.def.eligible': 'elegible por el modelo',
  'detail.yes': 'sí',
  'detail.no': 'no',
  'detail.vocab': 'palabras que nunca has escrito',
  'detail.openFlow': 'abrir en el lienzo',
  'detail.ev.proven': 'lo que ha hecho',
  'detail.ev.preloaded': 'precargadas en `skills:`',
  'detail.ev.declared': 'skills que su prompt le manda leer',
  'detail.ev.commands': 'comandos que lo convocan',
  'detail.ev.skills': 'skills que lo nombran',
  'detail.ev.field': ' · campo {field}',
  'detail.file': 'archivo',
  'detail.visibleAs': 'visible como {path}',

  // --- Buscador -----------------------------------------------------------------------------
  'search.title': 'Buscar agente, skill, comando, plugin o servidor MCP',
  'search.label': 'Nombre de lo que buscas',
  'search.placeholder': 'escribe un nombre…',
  'search.results': 'Resultados',
  'search.none': 'Nada coincide con lo escrito.',
  'search.count_one': '{n} resultado · ↑↓ para moverte, Intro para elegir, Esc para cerrar',
  'search.count_other': '{n} resultados · ↑↓ para moverte, Intro para elegir, Esc para cerrar',
  'search.main.detail': 'tu sesión, sin subagente',

  // --- Diálogos -----------------------------------------------------------------------------
  'dialog.keepEditing': 'Seguir editando',
  'diff.cancel': 'Cancelar',
  'diff.saving': 'Guardando…',
  'diff.save': 'Guardar en el archivo',
  'diff.noChange':
    'Este cambio no modifica el archivo: el contenido que se escribiría es idéntico al que ya hay, así que no hay nada que guardar.',
  'toast.close': 'Cerrar el aviso',

  // --- Editor de flujos ---------------------------------------------------------------------
  'flow.title': 'Flujo /{name}',
  'flow.untitled': 'sin-nombre',
  'flow.name': 'nombre',
  'flow.name.placeholder': 'revision-semanal',
  'flow.description': 'descripción',
  'flow.description.placeholder': 'Qué hace este comando, para el menú de /',
  'flow.noAgents':
    'No hay ningún agente en tu catálogo, y un flujo es una secuencia de delegaciones a agentes. Crea uno en `~/.claude/agents/` y vuelve a abrir el editor.',
  'flow.noSteps': 'Sin pasos todavía. Un flujo es una secuencia de delegaciones: añade la primera.',
  'flow.parallel': '↳ a la vez',
  'flow.phase': 'fase {n}',
  'flow.join': 'unir',
  'flow.join.title': 'Ejecutar a la vez que el paso anterior',
  'flow.split': 'separar',
  'flow.split.title':
    'Sacar este paso del grupo: empieza una fase nueva, después del paso anterior',
  'flow.up': 'Subir',
  'flow.up.aria': 'Subir el paso {n}',
  'flow.down': 'Bajar',
  'flow.down.aria': 'Bajar el paso {n}',
  'flow.remove': 'Quitar',
  'flow.remove.aria': 'Quitar el paso {n}',
  'flow.agent.aria': 'Agente del paso {n}',
  'flow.agent.unknown': '(desconocido: {agent})',
  'flow.agent.none': 'sin agente',
  'flow.agent.unknownNote':
    'Este paso nombra a un agente que no está en tu catálogo (¿lo borraste o lo archivaste?). Elige otro o se escribirá tal cual.',
  'flow.task.placeholder': 'qué le encargas',
  'flow.task.aria': 'Tarea del paso {n}',
  'flow.skill.add': '+ skill que debe consultar',
  'flow.skill.add.aria': 'Añadir una skill al paso {n}',
  'flow.skill.remove': 'quitar',
  'flow.skill.remove.aria': 'Quitar la skill {name}',
  'flow.add': '+ añadir paso',
  'flow.preview': 'lo que se escribirá',
  'flow.preview.failed': '(no se pudo generar la vista previa)',
  'flow.missing.name': 'ponle un nombre al comando',
  'flow.missing.steps': 'añade al menos un paso',
  'flow.missing.agent': 'elige el agente de cada paso',
  'flow.missing.task': 'escribe qué le encargas a cada agente',
  'flow.missing': 'Para guardar: {list}.',
  'flow.cancel': 'Cancelar',
  'flow.save': 'Ver diff y guardar',
  'flow.discard.title': '¿Descartar los cambios?',
  'flow.discard.text':
    'Has editado este flujo y todavía no se ha guardado nada en disco. Si sales ahora se pierde lo que llevas.',
  'flow.discard.confirm': 'Descartar y salir',

  // --- Plano --------------------------------------------------------------------------------
  'plano.aria': 'Plano del grafo de agentes, skills y comandos',
  'plano.layer.declared': 'declarada en la prosa',
  'plano.layer.preloaded': 'precargada en `skills:`',
  'plano.layer.proven': 'demostrada en el historial',
  'plano.node.aria': '{kind} {name}',
  'plano.main':
    'El hilo principal eres tú, no un archivo: no hay un prompt donde escribir la relación. Arrastra desde un agente.',
  'plano.drop': 'Suelta sobre una skill para crear la relación.',
  'plano.editHint':
    'Modo edición: arrastra de un agente a una skill para escribir la relación en su prompt.',

  // --- Errores ------------------------------------------------------------------------------
  'err.red':
    'No se puede hablar con el daemon de ai-office. ¿Está arrancado? Ejecuta `ai-office` (o `pnpm dev` en el repo) en una terminal y abre el enlace que imprime.',
  'err.auth':
    'El daemon rechazó el token. Cambia en cada arranque: copia el enlace nuevo que imprime `ai-office` (acaba en #t=…) y pégalo en esta pestaña.',
  'err.conflict':
    'El archivo cambió en disco mientras lo estabas editando. Revisa el cambio y vuelve a guardarlo: así no se pisa lo que escribió otra herramienta.',
  'err.json':
    'El servidor respondió algo que no es JSON. Suele ser el servidor de desarrollo sin daemon detrás: arranca `pnpm dev` y recarga.',
  'err.http': 'El servidor respondió {status}',
  'err.code.forbidden-host':
    'El daemon rechazó esta petición: el host no está permitido. Abre la aplicación desde el enlace que imprime `ai-office`.',
  'err.code.forbidden-origin':
    'El daemon rechazó esta petición: viene de un origen no permitido. Abre la aplicación desde el enlace que imprime `ai-office`.',
  'err.code.missing-header':
    'A la petición le falta la cabecera `x-ai-office`. Recarga la página; si persiste, la interfaz y el daemon no son de la misma versión.',
  'err.code.not-found':
    'El daemon no encontró lo que se pidió. Puede que lo hayan movido o borrado: recarga.',
  'err.code.invalid-request': 'El daemon rechazó la petición por no ser válida.',
  'err.code.internal': 'El daemon falló por dentro. Mira su terminal para ver el detalle.',

  'err.reason.entity-not-found':
    'Esa entidad no existe ({id}). Recarga para ver el catálogo actual.',
  'err.reason.command-not-found': 'El comando {id} no existe.',
  'err.reason.invalid-color': 'Color no válido: "{color}".',
  'err.reason.unknown-operation':
    'Operación desconocida: {kind}. Puede que la interfaz y el daemon no sean de la misma versión.',
  'err.reason.already-archived': '{name} ya está archivado.',
  'err.reason.not-archived': '{name} no está archivado.',
  'err.reason.path-outside-roots':
    'Esa ruta queda fuera de las carpetas que ai-office puede editar: {path}',
  'err.reason.target-exists':
    'Ya hay un archivo en {path}: renómbralo o muévelo antes, para no pisarlo.',
  'err.reason.symlink-archive':
    '{path} es un enlace simbólico: archiva el agente en su origen, no en la proyección.',
  'err.reason.file-exists':
    'Ya hay un archivo en {path}: elige otro nombre, o edita ese en vez de crearlo.',
  'err.reason.invalid-name':
    'El nombre "{name}" no vale: usa minúsculas, dígitos y guiones, sin empezar por guion (un flujo necesita al menos una letra o un número).',
  'err.reason.section-unclosed': 'Sección "{section}": hay marca de inicio pero no de fin.',
  'err.reason.no-frontmatter': 'No se puede editar: el archivo no tiene frontmatter.',

  // --- Avisos de un plan y problemas de una entidad (los trae el daemon con `code`) ----------
  'warn.unknown-model':
    '"{model}" no es uno de los alias conocidos ({known}); se guarda igualmente como id de modelo literal.',
  'warn.broken-citation': 'Cita rota: "{skill}" no existe en el catálogo de skills.',
  'warn.preload-cost':
    'Precargar no añade capacidad: el subagente podría invocar esas skills bajo demanda si las necesitara. Solo adelanta el coste: ~{tokens} tokens estimados en cada arranque.',
  'warn.handwritten-command':
    'Escribiste este comando a mano. Guardar desde el lienzo lo sustituye por la versión compilada: revisa el diff, porque se pierde lo que el lienzo no pudo importar.',
  'problem.no-frontmatter': 'Sin frontmatter.',
  'problem.unclosed-frontmatter': 'Frontmatter sin cerrar.',
  'problem.yaml-error': 'YAML: {detail}',
  'problem.yaml-unreadable': 'YAML ilegible: {detail}',
  'problem.frontmatter-not-object': 'El frontmatter no es un objeto.',
  'problem.agent-no-description': 'Sin description: el modelo no sabrá cuándo delegarle trabajo.',
  'problem.skill-no-description': 'Sin description: el modelo nunca la elegirá por su cuenta.',
  'problem.name-mismatch': 'El nombre "{name}" no coincide con el del archivo.',
  'problem.no-skill-md': 'No hay un SKILL.md legible.',
  'detail.problems': 'problemas',

  // --- Ver y medir: Registro (Ledger), visor de archivo, quién usa una skill ------------------
  'view.ledger': 'Registro',
  'header.edit.title.ledger': 'Solo disponible en el Plano: cambia de vista para editar el grafo',
  'header.new': 'nuevo',
  'header.new.title': 'Crear un agente, una skill, un comando o un flujo',
  'header.new.agent': 'nuevo agente',
  'header.new.skill': 'nueva skill',
  'header.new.command': 'nuevo comando',
  'spark.title': 'Usos por semana, últimas {n} semanas (de la más antigua a la actual): {values}',

  'ledger.aria':
    'Registro: cada agente, skill, comando, plugin y servidor MCP con lo que ha hecho de verdad',
  'ledger.filter.type': 'Filtrar por tipo',
  'ledger.filter.all': 'todo',
  'ledger.filter.agents': 'agentes',
  'ledger.filter.skills': 'skills',
  'ledger.filter.commands': 'comandos',
  'ledger.unused': 'solo sin usar',
  'ledger.unused.title': 'Filas sin ningún uso registrado en los {transcripts}',
  'ledger.search': 'buscar por nombre…',
  'ledger.count': '{n} de {total}',
  'ledger.none': 'Nada coincide con esos filtros.',
  'ledger.retired': '(jubilada)',
  'ledger.cost.retired': 'Jubilada: su description ya no se carga, así que ahora no cuesta nada.',
  'ledger.col.name': 'nombre',
  'ledger.col.kind': 'tipo',
  'ledger.col.grade': 'grado',
  'ledger.col.uses': 'usos',
  'ledger.col.sessions': 'sesiones',
  'ledger.col.projects': 'proyectos',
  'ledger.col.last': 'último uso',
  'ledger.col.trend': 'tendencia',
  'ledger.col.cost': 'coste de description',
  'ledger.col.cites': 'skills citadas / probadas',
  'ledger.col.calls': 'agentes que llama',
  'ledger.src.name':
    'Nombre del archivo en {agents}, {skills} o {commands}; un plugin se llama nombre@marketplace y un servidor, por su clave en .mcp.json o ~/.claude.json',
  'ledger.src.kind':
    'En qué carpeta vive el archivo: agents/, skills/ o commands/; o un plugin o un servidor MCP',
  'ledger.src.grade':
    'Grado según usos, sesiones y proyectos (caduca a los 90 días). Fuente: {transcripts}',
  'ledger.src.uses':
    'Invocaciones registradas en los {transcripts}; los comandos tecleados salen también de history.jsonl',
  'ledger.src.sessions': 'Sesiones distintas con al menos un uso. Fuente: {transcripts}',
  'ledger.src.projects': 'Proyectos distintos con al menos un uso. Fuente: {transcripts}',
  'ledger.src.last': 'Fecha del uso registrado más reciente. Fuente: {transcripts}',
  'ledger.src.trend':
    'Usos por semana en las últimas 12 semanas, de la más antigua a la actual; el punto es la semana en curso. Fuente: {transcripts}',
  'ledger.src.cost':
    'Skills y plugins: tokens estimados de la description (un plugin suma las de sus skills), que se carga en cada sesión. Fuente: `description` en SKILL.md',
  'ledger.src.cites':
    'Solo agentes: skills que su prompt cita o precarga (agents/*.md) sobre las que ha invocado de verdad ({transcripts})',
  'ledger.src.calls':
    'Solo comandos: agentes que nombra su texto (commands/*.md). Pasa el ratón por la cifra para ver cuáles',

  'detail.explain.ledger':
    'Cada fila del registro sale de uno de tus archivos, y sus cifras de tus transcripts. Pulsa una columna para ordenar; pulsa una fila para ver aquí su ficha.',
  'detail.trend': 'últimas 12 semanas',
  'detail.trend.src': 'Usos por semana, de la más antigua a la actual. Fuente: {transcripts}',
  'detail.byProject': 'por proyecto',
  'detail.byProject.more_one': 'y {n} proyecto más',
  'detail.byProject.more_other': 'y {n} proyectos más',
  'detail.who': 'quién la usa',
  'detail.who.none':
    'Ningún agente la cita, la precarga ni la ha invocado, y ningún comando la nombra.',
  'detail.who.proven': 'la ha invocado (acreditado)',
  'detail.who.preloaded': 'la precarga en `skills:`',
  'detail.who.declared': 'su prompt la cita (declarado)',
  'detail.who.commands': 'comandos que la nombran',
  'detail.cite.title': 'Abrir el archivo en esa línea',
  'detail.ev.callsAgents': 'agentes que llama',
  'detail.ev.callsSkills': 'skills que nombra',
  'detail.openFlow.note':
    'El editor de flujos compone el comando a partir de pasos; el editor de texto de arriba lo escribe a mano.',

  'viewer.show': 'ver archivo',
  'viewer.hide': 'ocultar archivo',
  'viewer.aria': 'Archivo de {name}, solo lectura',
  'viewer.close': 'cerrar',
  'viewer.frontmatter': '⋯ frontmatter · líneas {from}–{to}',
  'viewer.unavailable':
    'Este daemon no manda el contenido del archivo. Actualiza ai-office para verlo aquí.',

  // --- Editar: botones de la ficha y sus diálogos ---------------------------------------------
  'edit.cancel': 'Cancelar',
  'edit.review': 'Revisar el diff',
  'edit.discard.title': '¿Descartar los cambios?',
  'edit.discard.text':
    'Has editado esto y todavía no se ha guardado nada en disco. Si sales ahora, lo que escribiste se pierde.',
  'edit.discard.confirm': 'Descartar y salir',
  'edit.lines_one': '{n} línea',
  'edit.lines_other': '{n} líneas',
  'edit.filter': 'filtrar…',
  'edit.tokens': '~{n} tokens',
  'edit.missing': 'no está en el catálogo',
  'edit.byHand': 'escrita a mano en el prompt',
  'edit.noBody':
    'Este daemon no manda el contenido del archivo, así que no se puede editar desde aquí.',
  'edit.noSkills': 'No hay skills en tu catálogo.',
  'edit.noAgents': 'No hay agentes en tu catálogo.',
  'edit.btn.description': 'editar description',
  'edit.btn.prompt': 'editar prompt',
  'edit.btn.skillBody': 'editar SKILL.md',
  'edit.btn.commandBody': 'editar texto del comando',
  'edit.btn.hint': 'pista de argumento',
  'edit.btn.tools': 'herramientas…',
  'edit.btn.preloaded': 'skills precargadas…',
  'edit.btn.citations': 'skills que cita…',
  'edit.btn.assign': 'asignar a agentes…',
  'edit.field.description': 'description',
  'edit.field.prompt': 'prompt (el texto tras el frontmatter)',
  'edit.field.skillBody': 'cuerpo de SKILL.md (el texto tras el frontmatter)',
  'edit.field.commandBody': 'texto del comando (lo que se ejecuta al teclearlo)',
  'edit.field.hint': 'pista de argumento (sale tras el nombre del comando)',
  'edit.hint.note': 'Déjala vacía para quitar la pista del archivo.',
  'edit.tools.legend': 'Herramientas que este agente puede usar',
  'edit.tools.intro':
    'Las marcadas se escriben en `tools:`. Con "todas las herramientas" se quita el campo y el agente hereda todas.',
  'edit.tools.all': 'todas las herramientas (hereda todo)',
  'edit.preloaded.legend': 'Skills que se cargan al arrancar cada ejecución',
  'edit.preloaded.intro':
    'Precargar no añade capacidad: el agente podría invocar la skill cuando la necesite. Solo adelanta el coste, en cada arranque. El diff enseña la estimación.',
  'edit.citations.legend': 'Skills que su prompt le dice que lea',
  'edit.citations.intro':
    'Se escriben en la lista gestionada al final del prompt. Una skill que el prompt cita a mano en otro sitio sale marcada y bloqueada: edita el prompt para quitarla.',
  'edit.description.cost': 'Coste hoy: ~{n} tokens en cada sesión.',
  'edit.vocab.note':
    'Palabras de tus propios prompts que esta description no contiene: el modelo se guía por ellas.',
  'edit.assign.title': 'Asignar {name} a agentes',
  'edit.assign.legend': 'Agentes cuyo prompt cita esta skill',
  'edit.assign.intro':
    'Cada cambio reescribe la lista gestionada de skills de ese agente. Verás un diff por agente y se guardan juntos.',
  'toast.nothingToAssign': 'Nada que cambiar: todos los agentes ya citan lo que elegiste.',
  'toast.created': 'Creado {name}.',
  'diff.title.create': 'crear {kind} {name}',
  'diff.title.description': 'description de {name}',
  'diff.title.prompt': 'prompt de {name}',
  'diff.title.skillBody': 'SKILL.md de {name}',
  'diff.title.commandBody': 'texto de /{name}',
  'diff.title.tools': 'herramientas de {name}',
  'diff.title.preloaded': 'skills precargadas de {name}',
  'diff.title.mentions': 'skills citadas por {name}',
  'diff.title.hint': 'pista de argumento de /{name}',
  'diff.title.assign_one': 'asignar {skill}: {n} cambio en agentes',
  'diff.title.assign_other': 'asignar {skill}: {n} cambios en agentes',
  'diff.title.assignOne': 'skills citadas por {agent}, por {skill}',
  'diff.batch': 'Cambian {n} archivos. Cada diff se enseña abajo y se guardan todos juntos.',

  // --- Crear ----------------------------------------------------------------------------------
  'create.title.agent': 'Nuevo agente',
  'create.title.skill': 'Nueva skill',
  'create.title.command': 'Nuevo comando',
  'create.name': 'nombre',
  'create.name.rule':
    'Minúsculas, dígitos y guiones, hasta 64, sin empezar por guion. Es también el nombre del archivo.',
  'create.name.empty': 'Ponle un nombre.',
  'create.name.format':
    'Usa solo minúsculas, dígitos y guiones, hasta 64, y no empieces por guion.',
  'create.name.exists': 'Ese nombre ya está en uso.',
  'create.name.placeholder.agent': 'revisor-de-codigo',
  'create.name.placeholder.skill': 'notas-de-version',
  'create.name.placeholder.command': 'revision-semanal',
  'create.description': 'description',
  'create.description.placeholder.agent': 'Cuándo debe Claude delegar en este agente',
  'create.description.placeholder.skill': 'Cuándo debe Claude elegir esta skill',
  'create.description.placeholder.command': 'Qué hace este comando, para el menú /',
  'create.body.agent': 'prompt (opcional)',
  'create.body.skill': 'cuerpo de SKILL.md (opcional)',
  'create.body.command': 'texto del comando (opcional)',
  'create.command.flowHint': '¿Prefieres componerlo con pasos que delegan en agentes?',
  'create.command.flowLink': 'Usar el lienzo de flujos',

  // --- Ayuda: Registro y edición --------------------------------------------------------------
  'help.key.ledger': 'mostrar el Registro',
  'help.ledger.title': 'Cómo leer el Registro',
  'help.ledger.table':
    'Una fila por agente, skill, comando, plugin y servidor MCP, con filtros por tipo y por ámbito. Pulsa el título de una columna para ordenar y una fila para abrir su ficha a la derecha. El título de cada columna dice de qué archivo o campo sale su cifra.',
  'help.ledger.filters':
    'Filtra por tipo, marca **solo sin usar** para tener tu lista de limpieza, o busca por nombre.',
  'help.ledger.trend':
    '**Tendencia**: usos por semana en las últimas 12 semanas; el punto es la semana en curso. **Coste de description** es lo que cuesta una skill en cada sesión.',
  'help.edit.title': 'Editar desde la ficha',
  'help.edit.fields':
    'La description, las herramientas, las skills precargadas y las que cita un prompt se editan desde la ficha. Cada cambio enseña su diff antes de tocar el archivo.',
  'help.edit.prompt':
    '**Editar prompt** (y SKILL.md o el texto de un comando) abre un editor de texto a tamaño casi completo; avisa si sales con cambios sin guardar.',
  'help.edit.assign':
    'En una skill, **asignar a agentes** marca qué agentes la citan; revisas un diff por agente y se guardan juntos.',
  'help.edit.create':
    '**nuevo** en la cabecera crea un agente, una skill o un comando; el nombre se valida mientras escribes.',
  'help.edit.view':
    '**ver archivo** enseña el archivo real con sus números de línea; cada cita `archivo:línea` de la ficha lo abre en esa línea.',
  'welcome.ledger':
    '**Registro**: el mismo catálogo como una tabla ordenable, con usos, último uso y una tendencia semanal de cada cosa.',

  // --- Errores nuevos del daemon --------------------------------------------------------------
  'err.reason.empty-description': 'La description no puede estar vacía.',
  'err.reason.invalid-body': 'El texto a escribir no es válido: tiene que ser texto plano.',
  'err.reason.wrong-entity-kind':
    'Ese cambio no corresponde a este tipo de entidad ({kind} sobre un {entityKind}). Puede que la interfaz y el daemon estén desincronizados.',

  // --- Ámbito, "Show", plugins y servidores MCP ---------------------------------------------
  'count.sessions_one': '{n} sesión',
  'count.sessions_other': '{n} sesiones',
  'kind.plugin': 'plugin',

  'scope.label': 'ámbito',
  'scope.title':
    'Lo que lee ai-office: solo tus archivos de usuario, o además la carpeta .claude/ y el .mcp.json de un proyecto. Cambiarlo reconstruye todo.',
  'scope.option.user': 'Usuario ({root})',
  'scope.group.claude': 'Proyectos con carpeta .claude/',
  'scope.group.other': 'Otros proyectos en los que has trabajado',
  'scope.missing': 'carpeta inexistente',
  'scope.current': 'actual',
  'scope.demo':
    'La demo estática no puede cambiar de ámbito: se construyó para un único proyecto ficticio. Instala ai-office para alternar entre los tuyos.',
  'scope.user': 'usuario',
  'scope.project': 'proyecto',
  'scope.plugin': 'plugin {name}',
  'scope.local': 'local',
  'scope.managed': 'gestionado',
  'scope.builtin': 'integrado',
  'settings.user': 'usuario (tu settings.json, todos los proyectos)',
  'settings.project': 'proyecto (.claude/settings.json, compartido con el equipo)',
  'settings.local': 'local (.claude/settings.local.json, privado)',
  'settings.user.short': 'ajustes de usuario',
  'settings.project.short': 'ajustes del proyecto',
  'settings.local.short': 'ajustes locales',
  'settings.managed.short': 'ajustes gestionados',

  'show.button': 'mostrar',
  'show.title': 'Elige qué dibujan la Sala y el Plano. El Registro siempre enseña todo.',
  'show.legend': 'Mostrar en la Sala y en el Plano',
  'show.agents': 'Agentes',
  'show.skills': 'Skills',
  'show.commands': 'Comandos',
  'show.plugins': 'Plugins',
  'show.mcp': 'Servidores MCP',
  'show.note': 'Se guarda en {path}. El Registro lo ignora y siempre enseña todo.',
  'show.note.demo':
    'Solo se recuerda en esta pestaña. El Registro lo ignora y siempre enseña todo.',

  'read.plugins': 'plugins activos',
  'read.plugins.src':
    'Plugins habilitados sobre los instalados ({path} más el enabledPlugins de tus ajustes). {unused} sin usar; las descriptions de las skills de los habilitados cuestan ~{tokens} tokens en cada sesión.',
  'read.mcp': 'servidores mcp',
  'read.mcp.src': 'Servidores declarados en {files}',
  'read.mcp.unused': 'mcp sin usar',
  'read.mcp.unused.src': 'Servidores MCP sin una sola llamada en los {transcripts}',

  'room.servers': 'servidores',
  'room.servers.reason':
    'Un rack por servidor MCP. Luces encendidas: se ha usado (más luces, más uso). Apagadas: nunca. Tenue: deshabilitado.',
  'room.plugin': 'plugin · {name}',
  'room.plugin.reason': 'Plugin v{version} de {marketplace}. {description} Pulsa para abrirlo.',
  'tip.mcp': '{name} · MCP · {uses} · {grade}',
  'tip.mcp.never': '{name} · MCP · nunca usado',
  'tip.mcp.transport': ' · {transport} · {scope}',
  'tip.mcp.off': ' · deshabilitado',
  'tip.shadowed': ' · tapado por {by}',
  'office.legend.plugin':
    '**Placa `plugin · nombre`**: un plugin habilitado, con sus propios agentes y skills. Pulsa la placa para abrirlo.',
  'office.legend.rack':
    '**Sala de servidores**: un rack por servidor MCP. Luces encendidas, se ha usado; apagadas, nunca; tenue, deshabilitado.',
  'office.legend.shadowed':
    '**Tenue en el vestíbulo**: algo que otro ámbito tapa (un agente de proyecto con el mismo nombre que el tuyo, por ejemplo). Claude Code no lo carga.',

  'help.config.title': 'Ámbito, plugins y MCP',
  'help.config.scope':
    '**Ámbito** (cabecera): Usuario lee solo tus archivos; elegir un proyecto lee además su carpeta `.claude/` y su `.mcp.json`. Cambiarlo reconstruye todo y se recuerda.',
  'help.config.show':
    '**Mostrar** (cabecera): marca qué familias dibujan la Sala y el Plano. Los plugins arrancan encendidos solo si traen pocas piezas. El Registro siempre enseña todo.',
  'help.config.plugins':
    '**Los plugins** son despachos con la placa `plugin · nombre` en la Sala y llevan un anillo morado en el Plano. Sus archivos son de solo lectura porque una actualización los sobrescribe; se habilitan o deshabilitan desde su ficha.',
  'help.config.mcp':
    '**Los servidores MCP** son racks en la sala de servidores y hexágonos en el Plano. Luces encendidas: usado; apagadas: nunca; tenue: deshabilitado. Solo se ven los nombres de las variables de entorno, nunca sus valores.',
  'welcome.config':
    '**Ámbito y Mostrar** (cabecera): elige Usuario o un proyecto, y qué dibujan la Sala y el Plano. Los plugins tienen sus propios despachos y los servidores MCP sus propios racks.',

  'plano.legend.shapes':
    'hexágono = servidor MCP; anillo morado = pieza de un plugin; tenue = no se carga',

  'ledger.filter.plugins': 'plugins',
  'ledger.filter.mcp': 'MCP',
  'ledger.filter.scope': 'Filtrar por ámbito',
  'ledger.scope.all': 'cualquier ámbito',
  'ledger.scope.user': 'usuario',
  'ledger.scope.project': 'proyecto',
  'ledger.scope.plugin': 'plugin',
  'ledger.col.scope': 'ámbito',
  'ledger.col.enabled': 'habilitado',
  'ledger.src.scope':
    'De dónde sale: tu carpeta de usuario, el proyecto (.claude/ o .mcp.json) o un plugin',
  'ledger.src.enabled':
    'Plugins y servidores: si están encendidos (enabledPlugins, disabledMcpServers). Lo demás: cargado, es decir, ni tapado ni de un plugin deshabilitado',
  'ledger.enabled.perProject.short': 'por proyecto',
  'ledger.enabled.perProject':
    'Claude Code lo decide por proyecto. Abre un ámbito de proyecto para verlo.',
  'ledger.shadowed': '(tapado)',
  'ledger.shadowed.title': 'Otro ámbito lo tapa: Claude Code no lo carga',
  'ledger.cost.disabled':
    'Deshabilitado: su description no se carga, así que ahora no cuesta nada.',
  'ledger.tools': 'Herramientas más usadas: {tools}',

  'detail.fromPlugin':
    'Viene del plugin {plugin} · solo lectura (una actualización sobrescribe los archivos de un plugin).',
  'detail.plugin.open': 'abrir el plugin',
  'detail.shadowed': 'Tapado por {by}: Claude Code no carga este.',
  'detail.shadowed.open': 'abrirlo',
  'detail.ev.mcp': 'servidores MCP que nombra su `tools:`',
  'detail.ev.mcpName': 'MCP · {name}',
  'detail.ev.dangling': '(no configurado)',
  'detail.byTool': 'herramientas que ha llamado',
  'detail.byTool.more_one': '+{n} herramienta más',
  'detail.byTool.more_other': '+{n} herramientas más',
  'detail.byTool.src': 'Llamadas por herramienta (mcp__servidor__herramienta) en los {transcripts}',

  'detail.plugin.about': 'plugin',
  'detail.plugin.version': 'versión',
  'detail.plugin.marketplace': 'marketplace',
  'detail.plugin.enabled': 'habilitado',
  'detail.plugin.source': 'lo decide',
  'detail.plugin.source.src':
    'El archivo de ajustes cuyo enabledPlugins lo nombra con mayor precedencia. Lista de instalados: {root}/plugins/installed_plugins.json',
  'detail.plugin.source.none': 'ningún ajuste lo nombra',
  'detail.plugin.cost': 'coste de descriptions',
  'detail.plugin.cost.off': 'ahora no se carga',
  'detail.plugin.cost.src':
    'Tokens estimados de las descriptions de sus skills, que se cargan en cada sesión mientras esté habilitado',
  'detail.plugin.agents_one': '{n} agente',
  'detail.plugin.agents_other': '{n} agentes',
  'detail.plugin.skills_one': '{n} skill',
  'detail.plugin.skills_other': '{n} skills',
  'detail.plugin.commands_one': '{n} comando',
  'detail.plugin.commands_other': '{n} comandos',
  'detail.plugin.mcp_one': '{n} servidor MCP',
  'detail.plugin.mcp_other': '{n} servidores MCP',
  'detail.plugin.enable': 'habilitar plugin',
  'detail.plugin.disable': 'deshabilitar plugin',
  'detail.plugin.reload':
    'Claude Code solo relee los plugins al recargar: ejecuta `/reload-plugins` en tus sesiones abiertas tras guardar.',
  'detail.plugin.managed':
    'Un archivo de ajustes gestionado también nombra este plugin. Manda sobre lo que escribas aquí.',
  'detail.plugin.userOnly':
    'Solo están disponibles tus ajustes de usuario. Abre un ámbito de proyecto para escribir en sus ajustes de proyecto o locales.',
  'detail.plugin.readonly':
    'Los archivos de un plugin son copias que las actualizaciones sobrescriben, así que ai-office solo los lee.',
  'detail.settings.where': 'escribirlo en',
  'diff.title.plugin.enable': 'habilitar el plugin {name} en los {where}',
  'diff.title.plugin.disable': 'deshabilitar el plugin {name} en los {where}',

  'detail.mcp.about': 'servidor',
  'detail.mcp.scope': 'declarado en',
  'detail.mcp.transport': 'transporte',
  'detail.mcp.command': 'comando',
  'detail.mcp.host': 'host',
  'detail.mcp.enabled': 'habilitado aquí',
  'detail.mcp.disabledIn': 'deshabilitado en',
  'detail.mcp.keys': 'claves de configuración',
  'detail.mcp.env': 'variables de entorno',
  'detail.mcp.headers': 'cabeceras',
  'detail.mcp.keys.note': 'Solo se muestran los nombres: ai-office nunca enseña los valores.',
  'detail.mcp.who.declared': 'su `tools:` lo nombra (declarado)',
  'detail.mcp.who.none': 'Ningún agente lo nombra y el historial no muestra ninguna llamada.',
  'detail.mcp.enable': 'habilitar servidor',
  'detail.mcp.disable': 'deshabilitar servidor',
  'detail.mcp.perProject':
    'Claude Code guarda qué servidores están apagados **por proyecto**: esto cambia solo el proyecto abierto.',
  'detail.mcp.needsProject':
    'Claude Code decide qué servidores MCP están encendidos **por proyecto**, así que en el ámbito de usuario no hay nada que cambiar. Abre un proyecto para habilitarlo o deshabilitarlo.',
  'detail.mcp.fileNote':
    'Nunca se edita línea a línea: solo se cambia si está encendido o apagado, con su diff.',
  'diff.title.mcp.enable': 'habilitar el servidor MCP {name} en {project}',
  'diff.title.mcp.disable': 'deshabilitar el servidor MCP {name} en {project}',

  'create.scope': 'dónde',
  'create.scope.project': 'en el proyecto {name} (su carpeta .claude/)',
  'create.scope.user': 'para ti, en {root}',

  // --- Avisos y errores nuevos del daemon ---------------------------------------------------
  'warn.reload-needed':
    'Claude Code solo relee los plugins al recargar: ejecuta /reload-plugins en tus sesiones abiertas (o abre una nueva) para que el cambio surta efecto.',
  'warn.overridden':
    'Los ajustes {source} lo fijan al revés y mandan: el cambio se escribe pero no surte efecto hasta que se quite eso.',
  'err.reason.read-only':
    '{name} es de solo lectura: viene de un plugin (o de ajustes gestionados) y una actualización sobrescribiría cualquier edición.',
  'err.reason.unexpected-format':
    '{path} no tiene una forma que ai-office pueda reescribir con seguridad, así que no se tocó.',
  'err.reason.unreadable-json': '{path} no es un JSON válido, así que no se tocó.',
  'err.reason.invalid-scope': 'Ámbito no válido: "{scope}".',
  'err.reason.needs-project':
    'Eso necesita un ámbito de proyecto: elige primero un proyecto en la cabecera.',
  'err.reason.project-not-found': 'La carpeta del proyecto no existe: {path}',
  'err.reason.invalid-config': 'La configuración no es válida ({key}).',

  // --- Sobre qué se mide la actividad -------------------------------------------------------
  'measure.label': 'medido sobre',
  'measure.all': 'todos los proyectos',
  'measure.project': 'este proyecto · {sessions}',
  'measure.title':
    'Los usos, los grados y "sin uso" se cuentan sobre esto: en un ámbito de proyecto, solo las sesiones que corrieron dentro de él. Fuente: {transcripts}',
  'src.measured.project': ', solo este proyecto ({sessions})',
  'err.reason.claude-json-missing':
    'Claude Code aún no ha creado ~/.claude.json: abre primero una sesión.',
}
