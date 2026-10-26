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
  'help.key.search': 'buscar un agente, skill o comando y llevar la vista hasta él',
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
    '**Ficha** (a la derecha): pulsa cualquier cosa para ver qué dice de sí misma, qué ha hecho y de qué archivo sale cada dato. Desde ahí puedes editarla, siempre con diff.',
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
  'search.title': 'Buscar agente, skill o comando',
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
    'Ya hay un archivo en {path}: usa la operación de editar, no la de crear.',
  'err.reason.invalid-name':
    'El nombre "{name}" no vale para un comando: usa al menos una letra o un número.',
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
}
