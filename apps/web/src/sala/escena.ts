import { Application, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js'
import { etiquetaAmbito, type Tapadora } from '../alcance.ts'
import { claveDeConjunto } from '../derivados.ts'
import { t } from '../i18n/index.ts'
import { gradoEtiqueta, nombreHilo, nombreSala, razonTexto } from '../texto.ts'
import type { Snapshot } from '../types.ts'
import { type Atlas, cargarAtlas } from './atlas.ts'
import {
  altoPlanta,
  anchoPlanta,
  depthOf,
  MAMPARA_BAJA,
  MAMPARA_H,
  origenX,
  TILE,
  toScreen,
  WALL_H,
} from './iso.ts'
import {
  type Bahia,
  buildLayout,
  type Lomo,
  type Rack,
  type RoomLayout,
  type Seat,
  type Tarjeta,
} from './layout.ts'
import { mezcla } from './lienzo.ts'
import { COLOR_AGENTE, P, SIN_COLOR, UI } from './paleta.ts'
import {
  abrirAmbito,
  aTextura,
  balda,
  cacheada,
  cerrarAmbito,
  filtrarTodo,
  liberar,
  lomo,
  mampara,
  paredLarga,
  rack,
  sombra,
  sueloAlfombra,
  sueloRoble,
  tarjeta,
} from './texturas.ts'

/**
 * La planta, como escena de videojuego.
 *
 * Es IMPERATIVA a propósito: Pixi posee sus objetos y el ticker los mueve a 60 fps sin pasar por
 * React ni una sola vez. La regla del proyecto ("ningún estado que cambie a 60 fps entra en React
 * state") no es purismo: con `@pixi/react` cada respiración de cada figura sería un `setState`, y
 * veinte figuras respirando serían 1.200 renders de React por segundo.
 *
 * React solo hace tres cosas con esta clase: montarla, pasarle un snapshot y recibir avisos de
 * selección.
 */

/**
 * Escalas de cámara. Enteras al ampliar —un zoom de 1,37 interpola píxeles y destruye el aspecto
 * de pixel art— más un único paso de ALEJAMIENTO a la mitad.
 *
 * Ese 0,5 no es un capricho: con pasillos, la planta mide más de 2500 px y no cabe entera ni en
 * una ventana maximizada, así que sin él la primera impresión sería una esquina en vez del censo
 * completo. Es potencia de dos, que es la única reducción que no descuadra la retícula, y al
 * cruzar el 1x se cambia el filtrado a `linear` para que la miniatura no salga comida.
 */
const ESCALAS = [0.5, 1, 2, 3, 4]

/** Grado numérico del lomo (1 a 4) → clave de grado, para citarlo en el tooltip. */
const GRADO_DE = ['unused', 'unused', 'tried', 'practicing', 'certified']

/** Cuánto dura encendida una figura tras un evento en vivo. */
const MS_DESTELLO = 2600

/** Transparencia de lo que no se carga: tapado por otro ámbito o deshabilitado. */
const ALFA_TENUE = 0.45

interface Figura {
  seat: Seat
  /** A qué despacho pertenece: al señalar la placa se encienden los nombres de todos sus
   * ocupantes a la vez, que es como se lee un plano de oficina de verdad. */
  bahiaId: string
  raiz: Container
  cuerpo: Sprite
  rotulo: Text
  baseY: number
  destelloHasta: number
}

interface Pieza {
  id: string
  sprite: Sprite
  baseY: number
  destelloHasta: number
}

/** Un rótulo anclado a un punto del mundo: las placas de las puertas y los nombres de zona. */
interface Placa extends Text {
  mundoX: number
  mundoY: number
}

export interface OpcionesEscena {
  onSelect: (id: string | null) => void
}

export class Escena {
  private app = new Application()
  private atlas: Atlas | null = null
  private opciones: OpcionesEscena

  /** Mundo: escalado por enteros y desplazado por la cámara. Todo lo diegético vive aquí. */
  private mundo = new Container()
  private capaSuelo = new Container()
  private capaSombras = new Container()
  private capaObjetos = new Container()
  private capaLuz = new Container()
  /** HUD: NO se escala, así los rótulos salen nítidos en vez de pixelados junto al arte. */
  private hud = new Container()

  private figuras: Figura[] = []
  private lomos: Pieza[] = []
  private tarjetas: Pieza[] = []
  private racks: Pieza[] = []
  private placas: Placa[] = []
  private motas: { g: Graphics; vx: number; vy: number; vida: number }[] = []

  /**
   * Minimapa. Vive colgado del `stage` y NO del `hud`, porque el hud se vacía entero en cada
   * snapshot y el minimapa tiene que sobrevivir a eso.
   *
   * Usa la MISMA proyección que la planta, solo que reducida. Un minimapa cenital sería más
   * legible en abstracto, pero entonces el rectángulo de "lo que estás viendo" saldría girado y
   * deformado; compartiendo proyección, la vista es un rectángulo de verdad y la correspondencia
   * entre las dos imágenes es inmediata.
   */
  private minimapa = new Container()
  private minimapaFondo = new Graphics()
  private minimapaSalas = new Graphics()
  private minimapaVista = new Graphics()
  /** Esquina superior izquierda del mundo y factor de reducción del minimapa. */
  private mini = { x0: 0, y0: 0, k: 0.08, w: 0, h: 0 }
  private arrastrandoMini = false
  private anillo = new Graphics()
  private tooltip = new Text({
    text: '',
    style: { fontFamily: 'ui-monospace, monospace', fontSize: 12, fill: P.papel },
  })
  private fondoTooltip = new Graphics()

  /** Aro sobre el lomo o la tarjeta seleccionados. Va en la capa de luz, por ENCIMA de los lomos. */
  private resalte = new Graphics()

  private seleccion: string | null = null
  private hover: string | null = null
  /** Despacho señalado ahora mismo. Null = ninguno. */
  private hoverBahia: string | null = null
  private layout: RoomLayout | null = null
  private idPrincipal = ''

  private camara = { x: 0, y: 0, escala: 1 }
  /**
   * Si el usuario ya ha movido la cámara. Mientras no lo haya hecho, cualquier cambio de tamaño
   * del lienzo vuelve a encuadrar: el primer encuadre puede ocurrir con el tamaño viejo (la banda
   * de bienvenida o un aviso aún ocupan sitio, o el snapshot llega antes que el layout final) y
   * dejaba la planta fuera de la vista, con el lienzo aparentemente vacío.
   */
  private camaraManual = false
  private objetivo = { x: 0, y: 0, escala: 1 }
  private tiempo = 0

  /**
   * Ciclo de vida. `destruir()` puede llegar mientras `iniciar()` sigue esperando a Pixi o a las
   * texturas (cambiar de vista a mitad de carga): destruir una `Application` a medio inicializar
   * lanza, y destruirla dos veces también. Con este estado `destruir` es idempotente y `iniciar`
   * se retira solo si le han quitado el suelo.
   */
  private estado: 'nueva' | 'iniciando' | 'lista' | 'destruida' = 'nueva'
  private appIniciada = false
  /** Factor de densidad con el que se crea el lienzo: el del dispositivo si es entero, o 1. */
  private dpr = Number.isInteger(window.devicePixelRatio) ? Math.max(1, window.devicePixelRatio) : 1
  private observador: ResizeObserver | null = null

  /** Texturas creadas para el snapshot actual (suelo, paredes, mamparas): se liberan al siguiente. */
  private texturasDelSnapshot: Texture[] = []
  /** Conjunto de entidades del último snapshot: reencuadrar solo si cambia. */
  private claveConjunto = ''

  /** Acumulador de la rueda: un gesto de trackpad es un aluvión de eventos, no un clic. */
  private ruedaAcumulada = 0
  private ruedaUltima = 0
  private ruedaPasoDado = false

  constructor(opciones: OpcionesEscena) {
    this.opciones = opciones
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas
  }

  /** `destruir()` puede cambiar el estado durante un `await`: TypeScript no lo ve y estrecha el tipo. */
  private fueDestruida(): boolean {
    return this.estado === 'destruida'
  }

  async iniciar(host: HTMLElement): Promise<void> {
    if (this.estado !== 'nueva') return
    this.estado = 'iniciando'
    await this.app.init({
      background: UI.noche,
      antialias: false,
      // Resolución 1 y `image-rendering: pixelated` en CSS: el navegador amplía el lienzo con
      // vecino más cercano. Poner aquí un devicePixelRatio cualquiera suavizaría el píxel al
      // escalar. La ÚNICA excepción es un ratio ENTERO (2, 3): cada píxel de arte pasa a ser un
      // bloque exacto de 2x2 o 3x3 píxeles físicos, idéntico a lo que hacía el navegador, y a
      // cambio los rótulos de texto salen nítidos en pantallas Retina en vez de pixelados. Con
      // 1,25 o 1,5 sale un reparto desigual de píxeles: ahí se queda en 1.
      resolution: this.dpr,
      autoDensity: this.dpr > 1,
      roundPixels: true,
      resizeTo: host,
    })
    this.appIniciada = true
    if (this.fueDestruida()) {
      // Se destruyó mientras Pixi arrancaba: ahora que la app existe, se desmonta aquí.
      this.app.destroy(true, { children: true })
      return
    }
    host.appendChild(this.app.canvas)
    // `resizeTo` solo escucha el `resize` de la VENTANA. Si el lienzo cambia de tamaño por otra
    // razón (la banda de bienvenida se descarta, un aviso aparece sobre la cabecera, la ficha
    // pasa debajo en una ventana estrecha), el canvas se quedaba con el tamaño viejo y dejaba
    // una franja negra. Se observa el propio contenedor.
    this.observador = new ResizeObserver(() => {
      if (this.estado !== 'lista') return
      this.app.resize()
      if (!this.camaraManual) this.encajar()
    })
    this.observador.observe(host)
    this.atlas = await cargarAtlas()
    // Si `destruir()` llegó durante la carga, ya desmontó la app (existía): no se vuelve a hacer.
    if (this.fueDestruida()) return

    this.capaObjetos.sortableChildren = true
    this.mundo.addChild(this.capaSuelo, this.capaSombras, this.capaObjetos, this.capaLuz)
    this.app.stage.addChild(this.mundo, this.hud, this.minimapa)
    this.minimapa.addChild(this.minimapaFondo, this.minimapaSalas, this.minimapaVista)
    this.minimapa.eventMode = 'static'
    this.minimapa.cursor = 'pointer'
    const irA = (e: { global: { x: number; y: number } }) => {
      // Centrar la cámara en el punto del mundo que se ha señalado.
      const local = this.minimapa.toLocal(e.global)
      const wx = local.x / this.mini.k + this.mini.x0
      const wy = local.y / this.mini.k + this.mini.y0
      const ox = this.layout ? origenX(this.layout.filas) : 0
      this.camaraManual = true
      this.objetivo.x = this.app.renderer.width / 2 - (wx + ox) * this.camara.escala
      this.objetivo.y = this.app.renderer.height / 2 - wy * this.camara.escala
    }
    this.minimapa.on('pointerdown', (e) => {
      e.stopPropagation()
      this.arrastrandoMini = true
      irA(e)
    })
    this.minimapa.on('globalpointermove', (e) => {
      if (this.arrastrandoMini) irA(e)
    })
    this.minimapa.on('pointerup', () => {
      this.arrastrandoMini = false
    })
    this.minimapa.on('pointerupoutside', () => {
      this.arrastrandoMini = false
    })
    this.hud.addChild(this.fondoTooltip, this.tooltip)
    this.tooltip.visible = false
    this.fondoTooltip.visible = false
    this.capaLuz.eventMode = 'none'

    // Clic en el vacío: deselecciona. Hay que comprobar que el destino ES el propio stage: con
    // un `hitArea` que abarca todo, el stage recibe también el tap que ya atendió una figura, y
    // sin esta guarda deseleccionaba justo después de seleccionar.
    this.app.stage.eventMode = 'static'
    this.app.stage.hitArea = { contains: () => true }
    this.app.stage.on('pointertap', (e) => {
      if (e.target === this.app.stage) this.opciones.onSelect(null)
    })

    this.app.ticker.add((t) => this.tick(t.deltaMS))
    this.estado = 'lista'
  }

  // --- Construcción -------------------------------------------------------------------------

  /**
   * Destruye los hijos de un contenedor salvo los que se conservan. `removeChildren()` a secas
   * los suelta pero no los destruye: cada recarga dejaba sprites, textos y gráficos huérfanos en
   * memoria. Las texturas compartidas (atlas, lomos cacheados) NO se destruyen con el sprite.
   */
  private vaciar(c: Container, conservar: Container[] = []): void {
    for (const hijo of [...c.children]) {
      if (conservar.includes(hijo as Container)) continue
      c.removeChild(hijo)
      hijo.destroy({ children: true })
    }
  }

  /**
   * Reconstruye la planta con un snapshot nuevo. Devuelve `true` si cambió el CONJUNTO de
   * entidades (apareció o desapareció algo) y `false` si solo cambiaron los números: el llamador
   * reencuadra la cámara únicamente en el primer caso, para no mover la vista bajo el ratón.
   */
  aplicar(snapshot: Snapshot): boolean {
    if (!this.atlas || this.estado === 'destruida') return false
    this.layout = buildLayout(snapshot)
    this.idPrincipal = snapshot.mainThreadId

    this.vaciar(this.capaSuelo)
    this.vaciar(this.capaSombras, [this.anillo])
    this.vaciar(this.capaObjetos)
    this.vaciar(this.capaLuz, [this.resalte])
    this.vaciar(this.hud, [this.fondoTooltip, this.tooltip])
    if (!this.anillo.parent) this.capaSombras.addChild(this.anillo)
    if (!this.resalte.parent) this.capaLuz.addChild(this.resalte)
    // El tooltip y el estado de "señalado" apuntaban a objetos que acaban de destruirse.
    this.ocultarTooltip()
    liberar(this.texturasDelSnapshot)
    abrirAmbito()
    this.figuras = []
    this.lomos = []
    this.tarjetas = []
    this.racks = []
    this.placas = []
    this.motas = []

    // El origen depende del alto de la planta, que ahora cambia con el número de despachos.
    this.mundo.pivot.set(-origenX(this.layout.filas), 0)

    this.suelo(this.layout)
    this.perimetro(this.layout)
    for (const b of this.layout.bahias) this.bahia(b)
    this.puestoPrincipal(snapshot)
    this.dibujarMinimapa(this.layout)
    this.texturasDelSnapshot = cerrarAmbito()

    const clave = claveDeConjunto(snapshot)
    const cambio = clave !== this.claveConjunto
    this.claveConjunto = clave
    return cambio
  }

  /** Parqué en toda la planta y moqueta dentro de cada despacho. */
  private suelo(l: RoomLayout): void {
    const robles = [0, 1, 2].map((v) => aTextura(sueloRoble(v)))
    const moquetas = new Map<string, ReturnType<typeof aTextura>>()
    const tonoEn = (col: number, row: number): number | null => {
      for (const b of l.bahias) {
        if (col >= b.col0 && col < b.col1 && row >= b.row0 && row < b.row1) return b.tono
      }
      return null
    }

    for (let row = 0; row < l.filas; row++) {
      for (let col = 0; col < l.cols; col++) {
        const tono = tonoEn(col, row)
        let tex: ReturnType<typeof aTextura> | undefined
        if (tono === null) {
          tex = robles[(col * 3 + row * 5) % 3]
        } else {
          const clave = `${tono}:${(col + row) % 2}`
          if (!moquetas.has(clave)) {
            moquetas.set(clave, aTextura(sueloAlfombra((col + row) % 2, tono)))
          }
          tex = moquetas.get(clave)
        }
        if (!tex) continue
        const s = new Sprite(tex)
        const p = toScreen(col, row)
        s.position.set(p.x - TILE.w / 2, p.y)
        this.capaSuelo.addChild(s)
      }
    }
  }

  /** Las dos paredes exteriores del fondo, a altura completa. */
  private perimetro(l: RoomLayout): void {
    // Un segmento MÁS y medio paso a la izquierda: las dos paredes se encuentran en el vértice
    // superior, pero el tramo que va del vértice izquierdo de la primera baldosa a ese vértice
    // no pertenece a ninguna de las dos. Sin él queda una muesca negra justo en la esquina, que
    // es lo primero que mira el ojo.
    const derecha = new Sprite(aTextura(paredLarga(l.cols + 1, -1)))
    derecha.position.set(-TILE.w / 2, -WALL_H - TILE.h / 2)
    this.capaSuelo.addChild(derecha)

    const izquierda = new Sprite(aTextura(paredLarga(l.filas, 1)))
    izquierda.position.set(-l.filas * (TILE.w / 2) - TILE.w / 2, TILE.h / 2 - WALL_H)
    this.capaSuelo.addChild(izquierda)
  }

  // --- Un despacho --------------------------------------------------------------------------

  /** Una mampara a lo largo de una arista de fila (la que corre según `col`). */
  private mamparaFila(
    col: number,
    longitud: number,
    row: number,
    alto: number,
    bias: number,
  ): void {
    if (longitud <= 0) return
    const s = new Sprite(aTextura(mampara(longitud, -1, alto)))
    const p = toScreen(col, row)
    s.position.set(p.x, p.y - alto)
    s.zIndex = depthOf(col, row, bias)
    this.capaObjetos.addChild(s)
  }

  /** Una mampara a lo largo de una arista de columna (la que corre según `row`). */
  private mamparaColumna(
    col: number,
    row1: number,
    longitud: number,
    alto: number,
    bias: number,
  ): void {
    if (longitud <= 0) return
    const s = new Sprite(aTextura(mampara(longitud, 1, alto)))
    const p = toScreen(col, row1)
    // El borde inferior izquierdo del lienzo cae en (col, row1) y sube hacia (col, row1 - longitud).
    s.position.set(p.x, p.y - longitud * (TILE.h / 2) - alto)
    s.zIndex = depthOf(col, row1 - longitud, bias)
    this.capaObjetos.addChild(s)
  }

  private bahia(b: Bahia): void {
    const anchoCols = b.col1 - b.col0
    const altoRows = b.row1 - b.row0
    const pFondo = toScreen(b.col0, b.row0)

    // Las dos mamparas del FONDO van a altura de pecho: cierran el despacho por detrás sin tapar
    // nada, porque en isométrico lo que está detrás se dibuja antes.
    this.mamparaFila(b.col0, anchoCols, b.row0, MAMPARA_H, -400)
    this.mamparaColumna(b.col0, b.row1, altoRows, MAMPARA_H, -399)

    // Las dos de DELANTE van a la altura de un zócalo: dibujan el borde del despacho contra el
    // pasillo sin esconder a quien se sienta en la primera fila. Y la de delante lleva el hueco
    // de la puerta, que es lo que hace que una caja se lea como un despacho.
    this.mamparaFila(b.col0, b.puerta.col0 - b.col0, b.row1, MAMPARA_BAJA, 400)
    this.mamparaFila(b.puerta.col1, b.col1 - b.puerta.col1, b.row1, MAMPARA_BAJA, 401)
    this.mamparaColumna(b.col1, b.row1, altoRows, MAMPARA_BAJA, 402)

    // Jambas: dos postes que enmarcan el hueco. Sin ellos el hueco parece una mampara rota.
    for (const col of [b.puerta.col0, b.puerta.col1]) {
      const jamba = new Graphics()
      const p = toScreen(col, b.row1)
      jamba
        .rect(Math.round(p.x - 2), Math.round(p.y - 26), 4, 26)
        .fill({ color: P.nogal })
        .rect(Math.round(p.x - 2), Math.round(p.y - 26), 4, 3)
        .fill({ color: P.robleClaro })
      jamba.zIndex = depthOf(col, b.row1, 403)
      this.capaObjetos.addChild(jamba)
    }

    // Una balda por cada altura distinta. El vestíbulo tiene DOS: arriba el archivo de lo que
    // usa media planta y abajo el depósito de lo que no reclama nadie. Sin una balda por altura
    // los lomos de la de abajo flotaban en el aire.
    for (const altura of new Set(b.lomos.map((x) => x.altura))) {
      const plancha = new Sprite(aTextura(balda(anchoCols, -1)))
      plancha.position.set(pFondo.x, pFondo.y - altura)
      plancha.zIndex = depthOf(b.col0, b.row0, -398)
      this.capaObjetos.addChild(plancha)
    }

    this.placa(b)
    for (const a of b.adornos) this.mueble(a.mueble, a.col, a.row)
    for (const s of b.agentes) {
      // Cada agente con su puesto: escritorio delante y silla detrás. Es lo que convierte una
      // fila de figuras en una oficina diáfana.
      this.mueble('escritorio', s.col, s.row + 0.42)
      this.mueble('silla', s.col + 0.3, s.row - 0.28)
      this.figura(s, b.id)
    }
    for (const l of b.lomos) this.lomo(l)
    for (const t of b.tarjetas) this.tarjetaEn(t)
    for (const r of b.racks) this.rackEn(r)
  }

  /** El texto de la placa de un despacho, según lo que es. */
  private textoPlaca(b: Bahia): string {
    if (b.tipo === 'hub') return t('room.hub')
    if (b.tipo === 'servers') return `${t('room.servers')}  ·  ${b.racks.length}`
    if (b.tipo === 'plugin') return t('room.plugin', { name: b.nombre })
    return `${nombreSala(b)}  ·  ${b.agentes.length}`
  }

  /** Lo que dice el tooltip al señalar la placa: el motivo de la agrupación, o qué es esta sala. */
  private textoMotivo(b: Bahia): string {
    if (b.tipo === 'hub') return t('room.hub.reason')
    if (b.tipo === 'servers') return t('room.servers.reason')
    if (b.tipo === 'plugin' && b.plugin) {
      return t('room.plugin.reason', {
        version: b.plugin.version,
        marketplace: b.plugin.marketplace,
        description: b.plugin.description ?? '',
      })
    }
    return razonTexto(b)
  }

  /** La placa de la puerta: el nombre del despacho y cuánta gente hay. */
  private placa(b: Bahia): void {
    const esHub = b.tipo === 'hub'
    const p = toScreen((b.col0 + b.col1) / 2, b.row0)
    // El ámbar es de los despachos del usuario; un plugin y la sala de servidores llevan su propio
    // color de la paleta, el mismo que el minimapa, para reconocerlos de lejos.
    const color =
      b.tipo === 'plugin'
        ? mezcla(P.ciruela, P.luz, 0.4)
        : b.tipo === 'servers'
          ? mezcla(P.cian, P.luz, 0.3)
          : esHub
            ? P.papel
            : UI.ambar
    const placa = new Text({
      text: this.textoPlaca(b),
      style: {
        fontFamily: 'ui-monospace, monospace',
        fontSize: 11,
        fill: color,
        letterSpacing: 1,
        fontWeight: 'bold',
        stroke: { color: UI.noche, width: 4 },
      },
    }) as Placa
    placa.anchor.set(0.5, 1)
    placa.mundoX = p.x
    placa.mundoY = p.y - MAMPARA_H - 12
    this.hud.addChild(placa)
    this.placas.push(placa)

    // La placa es la vía para leer el motivo, que es lo que hace honesta la agrupación. La frase
    // se redacta al señalar, con el idioma de ese momento.
    placa.eventMode = 'static'
    placa.cursor = 'help'
    placa.on('pointerover', () => {
      this.hover = b.id
      this.hoverBahia = b.id
      this.mostrarTooltip(this.textoMotivo(b))
    })
    placa.on('pointerout', () => {
      if (this.hover === b.id) this.ocultarTooltip()
    })
    // La placa de un plugin lleva a su ficha: es la única entidad de la planta sin figura propia.
    if (b.tipo === 'plugin' && b.plugin) {
      const id = b.plugin.id
      placa.on('pointertap', (e) => {
        e.stopPropagation()
        this.opciones.onSelect(id)
      })
    }
  }

  /** " · tapada por …", o vacío si la entidad se carga: lo que se añade al tooltip de lo tapado. */
  private textoTapada(tapada?: Tapadora): string {
    if (!tapada) return ''
    return t('tip.shadowed', {
      by: `${tapada.name} (${etiquetaAmbito({ scope: tapada.scope })})`,
    })
  }

  private mueble(nombre: string, col: number, row: number): void {
    const tex = this.atlas?.color[nombre]
    if (!tex) return
    const s = new Sprite(tex)
    s.anchor.set(0.5, 1)
    const p = toScreen(col, row)
    s.position.set(Math.round(p.x), Math.round(p.y + TILE.h / 2))
    s.zIndex = depthOf(col, row)
    this.capaObjetos.addChild(s)
    this.sombraEn(col, row, Math.max(8, tex.width * 0.42))
  }

  private sombraEn(col: number, row: number, rx: number): void {
    const tex = cacheada(`sombra:${Math.round(rx)}`, () =>
      sombra(Math.round(rx), Math.max(3, Math.round(rx * 0.45))),
    )
    const s = new Sprite(tex)
    s.anchor.set(0.5, 0.5)
    const p = toScreen(col, row)
    s.position.set(Math.round(p.x), Math.round(p.y + TILE.h / 2))
    this.capaSombras.addChild(s)
  }

  private figura(seat: Seat, bahiaId: string, rotuloTexto?: string): void {
    if (!this.atlas) return
    // Desaturado = NUNCA DELEGADO. Son dos datos distintos y no pueden compartir canal: si el
    // gris dependiera de `color:`, como hoy no lo tiene ninguno saldrían todos en gris y se
    // perdería lo único que importa ver de entrada — quién ha trabajado y quién no.
    const tex =
      seat.unused || seat.tapada ? this.atlas.gris[seat.figura] : this.atlas.color[seat.figura]
    if (!tex) return

    const raiz = new Container()
    const p = toScreen(seat.col, seat.row)
    const baseY = Math.round(p.y + TILE.h / 2)
    raiz.position.set(Math.round(p.x), baseY)
    raiz.zIndex = depthOf(seat.col, seat.row, 1)

    const cuerpo = new Sprite(tex)
    cuerpo.anchor.set(0.5, 1)
    raiz.addChild(cuerpo)
    // Lo tapado por otro ámbito no se carga: se queda en la planta, pero tenue.
    if (seat.tapada) raiz.alpha = ALFA_TENUE

    // Placa de color a los pies: es donde vive el `color:` del frontmatter, porque el sprite ya
    // viene pintado. Sin `color:` no hay placa: no falta un adorno, falta un campo.
    if (seat.colorIndex !== null) {
      const disco = new Graphics()
      disco
        .ellipse(0, -1, 13, 6)
        .fill({ color: COLOR_AGENTE[seat.colorIndex] ?? SIN_COLOR, alpha: 0.55 })
      raiz.addChildAt(disco, 0)
    }

    cuerpo.eventMode = 'static'
    cuerpo.cursor = 'pointer'
    cuerpo.on('pointertap', (e) => {
      e.stopPropagation()
      this.opciones.onSelect(seat.id)
    })
    cuerpo.on('pointerover', () => {
      this.hover = seat.id
      this.hoverBahia = bahiaId
      this.mostrarTooltip(
        (seat.unused
          ? t('tip.agent.never', { name: seat.name })
          : t('tip.agent', {
              name: seat.name,
              delegations: t('count.delegations', { n: seat.uses }),
              grade: gradoEtiqueta(seat.grade),
            })) + this.textoTapada(seat.tapada),
      )
    })
    cuerpo.on('pointerout', () => {
      if (this.hover === seat.id) this.ocultarTooltip()
    })

    const rotulo = new Text({
      text: rotuloTexto ?? seat.name,
      style: {
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        fontSize: 11,
        fill: seat.unused ? P.grisApagado : P.yeso,
        stroke: { color: UI.noche, width: 3 },
      },
    })
    rotulo.anchor.set(0.5, 0)
    this.hud.addChild(rotulo)

    this.capaObjetos.addChild(raiz)
    this.sombraEn(seat.col, seat.row, 11)
    this.figuras.push({ seat, bahiaId, raiz, cuerpo, rotulo, baseY, destelloHasta: 0 })
  }

  private lomo(l: Lomo): void {
    // Sin uso: lomo en blanco, sin tejuelo. Con uso pero sin dueño coloreado: madera. Con dueño
    // coloreado: su color. Los tres estados son datos, y el tooltip los cita.
    const color = l.unused
      ? null
      : l.colorIndex !== null
        ? (COLOR_AGENTE[l.colorIndex] ?? P.roble)
        : P.roble
    const tex = cacheada(`lomo:${l.grado}:${color ?? 'blanco'}`, () => lomo(l.grado, color))
    const s = new Sprite(tex)
    s.anchor.set(0.5, 1)
    const p = toScreen(l.col, l.row)
    s.position.set(Math.round(p.x), Math.round(p.y + TILE.h / 2 - l.altura))
    s.zIndex = depthOf(l.col, l.row, -300)
    if (l.tapada) s.alpha = ALFA_TENUE
    s.eventMode = 'static'
    s.cursor = 'pointer'
    s.on('pointertap', (e) => {
      e.stopPropagation()
      this.opciones.onSelect(l.id)
    })
    s.on('pointerover', () => {
      this.hover = l.id
      this.mostrarTooltip(
        (l.unused
          ? t('tip.skill.never', { name: l.name })
          : t('tip.skill', {
              name: l.name,
              uses: t('count.uses', { n: l.uses }),
              grade: gradoEtiqueta(GRADO_DE[l.grado]),
            }) + (l.duenio ? t('tip.skill.owner', { owner: l.duenio }) : '')) +
          this.textoTapada(l.tapada),
      )
    })
    s.on('pointerout', () => {
      if (this.hover === l.id) this.ocultarTooltip()
    })
    this.capaObjetos.addChild(s)
    this.lomos.push({ id: l.id, sprite: s, baseY: s.y, destelloHasta: 0 })
  }

  private tarjetaEn(tarj: Tarjeta): void {
    const tex = cacheada(`tarjeta:${tarj.used}`, () => tarjeta(tarj.used, 26, 17))
    const s = new Sprite(tex)
    s.anchor.set(0.5, 0.5)
    const p = toScreen(tarj.col, tarj.row)
    s.position.set(Math.round(p.x - TILE.w / 4), Math.round(p.y + TILE.h / 4 - tarj.altura))
    s.zIndex = depthOf(tarj.col, tarj.row, -290)
    if (tarj.tapada) s.alpha = ALFA_TENUE
    s.eventMode = 'static'
    s.cursor = 'pointer'
    s.on('pointertap', (e) => {
      e.stopPropagation()
      this.opciones.onSelect(tarj.id)
    })
    s.on('pointerover', () => {
      this.hover = tarj.id
      this.mostrarTooltip(
        t(tarj.used ? 'tip.command.run' : 'tip.command.never', { name: tarj.name }) +
          this.textoTapada(tarj.tapada),
      )
    })
    s.on('pointerout', () => {
      if (this.hover === tarj.id) this.ocultarTooltip()
    })
    this.capaObjetos.addChild(s)
    this.tarjetas.push({ id: tarj.id, sprite: s, baseY: s.y, destelloHasta: 0 })
  }

  /**
   * Un servidor MCP. Las luces son el grado de uso (apagadas = nunca ha atendido nada) y un
   * servidor deshabilitado se dibuja tenue, como lo tapado: no se carga.
   */
  private rackEn(r: Rack): void {
    const tex = cacheada(`rack:${r.estado === 'off' ? 0 : r.luces}`, () =>
      rack(r.estado === 'off' ? 0 : r.luces),
    )
    const s = new Sprite(tex)
    s.anchor.set(0.5, 1)
    const p = toScreen(r.col, r.row)
    s.position.set(Math.round(p.x), Math.round(p.y + TILE.h / 2))
    s.zIndex = depthOf(r.col, r.row)
    if (r.estado === 'off') s.alpha = ALFA_TENUE
    s.eventMode = 'static'
    s.cursor = 'pointer'
    s.on('pointertap', (e) => {
      e.stopPropagation()
      this.opciones.onSelect(r.id)
    })
    s.on('pointerover', () => {
      this.hover = r.id
      this.mostrarTooltip(
        (r.uses > 0
          ? t('tip.mcp', {
              name: r.name,
              uses: t('count.uses', { n: r.uses }),
              grade: gradoEtiqueta(r.grade),
            })
          : t('tip.mcp.never', { name: r.name })) +
          t('tip.mcp.transport', {
            transport: r.transport,
            scope: etiquetaAmbito({ scope: r.scope }),
          }) +
          (r.estado === 'off' ? t('tip.mcp.off') : ''),
      )
    })
    s.on('pointerout', () => {
      if (this.hover === r.id) this.ocultarTooltip()
    })
    this.capaObjetos.addChild(s)
    this.sombraEn(r.col, r.row, 11)
    this.racks.push({ id: r.id, sprite: s, baseY: s.y, destelloHasta: 0 })
  }

  /** El hilo principal: el único puesto de la planta que no sale de ningún archivo. */
  private puestoPrincipal(snapshot: Snapshot): void {
    const c = this.layout?.main
    if (!c) return
    this.mueble('escritorio', c.col, c.row + 0.5)
    this.mueble('lampara', c.col + 0.9, c.row + 0.28)
    this.mueble('bandejas', c.col - 0.9, c.row + 0.4)
    this.figura(
      {
        id: snapshot.mainThreadId,
        name: nombreHilo(),
        col: c.col,
        row: c.row,
        figura: 'ingeniero',
        archetype: 'ingeniero',
        colorIndex: 5,
        unused: false,
        uses: snapshot.stats.mainThreadSkills,
        grade: 'certified',
        fase: 0,
      },
      'hub',
      t('tip.main', {
        name: nombreHilo(),
        skills: t('count.skills', { n: snapshot.stats.mainThreadSkills }),
      }),
    )

    const foco = new Graphics()
    const p = toScreen(c.col, c.row)
    for (let i = 8; i > 0; i--) {
      foco.ellipse(p.x, p.y, 90 + i * 26, (90 + i * 26) * 0.5).fill({ color: P.luz, alpha: 0.014 })
    }
    foco.blendMode = 'add'
    this.capaLuz.addChild(foco)
  }

  /** Los cuatro vértices de un rectángulo de baldosas, ya en coordenadas del minimapa. */
  private rombo(col0: number, row0: number, col1: number, row1: number): number[] {
    const pts = [
      toScreen(col0, row0),
      toScreen(col1, row0),
      toScreen(col1, row1),
      toScreen(col0, row1),
    ]
    return pts.flatMap((p) => [
      (p.x - this.mini.x0) * this.mini.k,
      (p.y - this.mini.y0) * this.mini.k,
    ])
  }

  /** La parte del minimapa que no cambia: el contorno de la planta y cada despacho. */
  private dibujarMinimapa(l: RoomLayout): void {
    const ANCHO = 230
    const bordeIzq = -l.filas * (TILE.w / 2) - TILE.w / 2
    const anchoMundo = anchoPlanta(l.cols, l.filas) + TILE.w / 2
    const altoMundo = altoPlanta(l.cols, l.filas) + WALL_H
    const k = ANCHO / anchoMundo
    this.mini = {
      x0: bordeIzq,
      y0: -WALL_H,
      k,
      w: ANCHO,
      h: altoMundo * k,
    }

    this.minimapaFondo
      .clear()
      .roundRect(-6, -6, ANCHO + 12, this.mini.h + 12, 4)
      .fill({ color: UI.noche, alpha: 0.82 })
      .stroke({ color: UI.linea, width: 1 })

    this.minimapaSalas.clear()
    // El suelo entero, para que se vea la forma de la planta y dónde están los pasillos.
    this.minimapaSalas.poly(this.rombo(0, 0, l.cols, l.filas)).fill({ color: UI.maderaAlta })
    for (const b of l.bahias) {
      const color =
        b.tipo === 'hub'
          ? UI.ambar
          : b.tipo === 'plugin'
            ? P.ciruela
            : b.tipo === 'servers'
              ? P.cian
              : (COLOR_AGENTE[b.tono % COLOR_AGENTE.length] ?? P.roble)
      this.minimapaSalas
        .poly(this.rombo(b.col0, b.row0, b.col1, b.row1))
        .fill({ color, alpha: b.tipo === 'hub' ? 0.95 : 0.6 })
    }
  }

  /** El rectángulo de lo que se está viendo. Se redibuja cada cuadro porque la cámara se mueve. */
  private dibujarVistaMinimapa(): void {
    if (!this.layout) return
    const ox = origenX(this.layout.filas)
    const e = this.camara.escala
    const x0 = (-this.camara.x / e - ox - this.mini.x0) * this.mini.k
    const y0 = (-this.camara.y / e - this.mini.y0) * this.mini.k
    const x1 = x0 + (this.app.renderer.width / e) * this.mini.k
    const y1 = y0 + (this.app.renderer.height / e) * this.mini.k
    // Recortado al panel: alejado del todo se ve MÁS mundo del que hay, así que sin recortar el
    // rectángulo se salía del minimapa y pintaba dos rayas sueltas encima de la planta.
    const dentro = (v: number, max: number) => Math.max(0, Math.min(max, v))
    const cx0 = dentro(x0, this.mini.w)
    const cy0 = dentro(y0, this.mini.h)
    const cx1 = dentro(x1, this.mini.w)
    const cy1 = dentro(y1, this.mini.h)
    this.minimapaVista.clear()
    // Si la vista abarca el minimapa entero no se dibuja nada: un marco pegado al borde del
    // panel no informa de nada y solo añade ruido.
    if (cx1 - cx0 < this.mini.w - 1 || cy1 - cy0 < this.mini.h - 1) {
      this.minimapaVista
        .rect(cx0, cy0, cx1 - cx0, cy1 - cy0)
        .stroke({ color: P.papel, width: 1, alpha: 0.9 })
    }
    // Colocado abajo a la izquierda, sobre el lienzo y fuera del paso de la ficha lateral.
    this.minimapa.position.set(18, this.app.renderer.height - this.mini.h - 18)
  }

  // --- Interacción --------------------------------------------------------------------------

  seleccionar(id: string | null): void {
    this.seleccion = id
  }

  /** Dónde está una entidad en el mundo (sin el desplazamiento del origen), o null si la Sala no la dibuja. */
  private posicionDe(id: string): { x: number; y: number } | null {
    const f = this.figuras.find((x) => x.seat.id === id)
    if (f) return { x: f.raiz.x, y: f.baseY - 20 }
    for (const lista of [this.lomos, this.tarjetas, this.racks]) {
      const p = lista.find((x) => x.id === id)
      if (p)
        return {
          x: p.sprite.x,
          y: p.sprite.y - (p.sprite.anchor.y === 1 ? p.sprite.height / 2 : 0),
        }
    }
    // El despacho de un plugin se representa por su placa: se centra en el medio de la bahía.
    const bahia = this.layout?.bahias.find((b) => b.plugin?.id === id)
    if (bahia) {
      return toScreen((bahia.col0 + bahia.col1) / 2, (bahia.row0 + bahia.row1) / 2)
    }
    return null
  }

  /** ¿La Sala dibuja esta entidad? Skills y comandos del Plano que no tienen puesto aquí devuelven false. */
  tiene(id: string): boolean {
    return this.posicionDe(id) !== null
  }

  /** Centra la cámara en una entidad, sin cambiar el zoom. Devuelve false si la Sala no la dibuja. */
  centrarEn(id: string): boolean {
    const p = this.posicionDe(id)
    if (!p) return false
    const ox = this.layout ? origenX(this.layout.filas) : 0
    this.camaraManual = true
    this.objetivo.x = this.app.renderer.width / 2 - (p.x + ox) * this.objetivo.escala
    this.objetivo.y = this.app.renderer.height / 2 - p.y * this.objetivo.escala
    return true
  }

  /** ¿Está el punto (coordenadas del lienzo) sobre el minimapa? Para que arrastrarlo no mueva la cámara. */
  enMinimapa(x: number, y: number): boolean {
    const m = this.minimapa.position
    return x >= m.x - 6 && x <= m.x + this.mini.w + 6 && y >= m.y - 6 && y <= m.y + this.mini.h + 6
  }

  /** Un evento en vivo: la figura o el lomo se enciende unos segundos. */
  destello(id: string): void {
    const ahora = performance.now()
    const f = this.figuras.find((x) => x.seat.id === id)
    if (f) f.destelloHasta = ahora + MS_DESTELLO
    for (const lista of [this.lomos, this.tarjetas]) {
      const p = lista.find((x) => x.id === id)
      if (p) p.destelloHasta = ahora + MS_DESTELLO
    }
  }

  /**
   * Un paso de zoom (`1` acerca, `-1` aleja) anclado a un punto del lienzo: lo que está bajo el
   * cursor sigue bajo el cursor. Sin punto, se ancla al centro. La escala sigue siendo una de
   * `ESCALAS` —enteras al ampliar, un único 0,5 al alejar—, así que el píxel no se interpola.
   */
  zoomPaso(
    direccion: 1 | -1,
    x = this.app.renderer.width / 2,
    y = this.app.renderer.height / 2,
  ): void {
    const i = ESCALAS.indexOf(this.objetivo.escala)
    const j = Math.max(0, Math.min(ESCALAS.length - 1, (i < 0 ? 1 : i) + direccion))
    const nueva = ESCALAS[j] ?? 1
    if (nueva === this.objetivo.escala) return
    this.camaraManual = true
    // Punto del mundo bajo el cursor (con el origen incluido), antes y después del cambio.
    const u = (x - this.objetivo.x) / this.objetivo.escala
    const v = (y - this.objetivo.y) / this.objetivo.escala
    this.objetivo.escala = nueva
    this.objetivo.x = x - u * nueva
    this.objetivo.y = y - v * nueva
  }

  /**
   * La rueda llega como un aluvión de eventos, y un gesto de trackpad suma cientos de píxeles:
   * con un paso por evento, medio gesto llevaba de 0,5x a 4x. Se acumula hasta un umbral y se da
   * UN paso por gesto; el gesto termina tras un silencio. Para más, están +/- del teclado.
   */
  rueda(deltaY: number, modo: number, x: number, y: number): void {
    const GAP_GESTO = 140
    const UMBRAL = 40
    const ahora = performance.now()
    if (ahora - this.ruedaUltima > GAP_GESTO) {
      this.ruedaAcumulada = 0
      this.ruedaPasoDado = false
    }
    this.ruedaUltima = ahora
    if (this.ruedaPasoDado) return
    this.ruedaAcumulada += deltaY * (modo === 1 ? 16 : modo === 2 ? 100 : 1)
    if (Math.abs(this.ruedaAcumulada) < UMBRAL) return
    this.zoomPaso(this.ruedaAcumulada < 0 ? 1 : -1, x, y)
    this.ruedaPasoDado = true
    this.ruedaAcumulada = 0
  }

  desplazar(dx: number, dy: number): void {
    this.camaraManual = true
    this.objetivo.x += dx
    this.objetivo.y += dy
  }

  private mostrarTooltip(texto: string): void {
    this.tooltip.text = texto
    this.tooltip.visible = true
    this.fondoTooltip.visible = true
  }

  private ocultarTooltip(): void {
    this.hover = null
    this.hoverBahia = null
    this.tooltip.visible = false
    this.fondoTooltip.visible = false
  }

  // --- Bucle --------------------------------------------------------------------------------

  private tick(ms: number): void {
    this.tiempo += ms
    const t = this.tiempo / 1000
    const ahora = performance.now()

    // Cámara: persecución exponencial, ~200 ms por cambio de zoom. Se nota que se mueve pero no
    // marea, y al redondear la posición el píxel no vibra.
    const antes = this.camara.escala
    this.camara.escala += (this.objetivo.escala - this.camara.escala) * 0.14
    // La persecución exponencial nunca llega del todo: dejaría la escala en 0,9999 para siempre
    // y el pixel art sin ser exactamente entero. Al estar a una milésima, se clava.
    if (Math.abs(this.objetivo.escala - this.camara.escala) < 0.001) {
      this.camara.escala = this.objetivo.escala
    }
    // El filtro solo cambia al cruzar el 1x, no en cada cuadro: recorrer todas las texturas es
    // barato pero no gratis, y hacerlo sesenta veces por segundo sería absurdo.
    if (antes * this.dpr >= 1 !== this.camara.escala * this.dpr >= 1) {
      filtrarTodo(this.camara.escala * this.dpr >= 1 ? 'nearest' : 'linear')
    }
    this.camara.x += (this.objetivo.x - this.camara.x) * 0.18
    this.camara.y += (this.objetivo.y - this.camara.y) * 0.18
    this.mundo.scale.set(this.camara.escala)
    this.mundo.position.set(Math.round(this.camara.x), Math.round(this.camara.y))

    for (const f of this.figuras) {
      const vivo = f.destelloHasta > ahora
      const vel = vivo ? 5.2 : 1.35
      const amp = vivo ? 2 : 1
      f.raiz.y =
        f.baseY - Math.round((Math.sin(t * vel + f.seat.fase * Math.PI * 2) + 1) * 0.5 * amp)
      f.cuerpo.tint = vivo ? UI.destello : 0xffffff
      const sel = this.seleccion === f.seat.id
      // Diecinueve nombres sobre una planta entera son ilegibles a cualquier tamaño, y el
      // reparto de rótulos no puede arreglar lo que sencillamente no cabe. Así que a vista de
      // planta mandan las placas de los despachos, y los nombres aparecen al acercarse, al
      // señalar el despacho o al seleccionar a alguien. El zoom deja de ser un adorno.
      f.rotulo.visible =
        f.seat.id === this.idPrincipal ||
        this.camara.escala >= 2 ||
        sel ||
        this.hoverBahia === f.bahiaId ||
        f.destelloHasta > ahora
      f.rotulo.style.fill = sel ? UI.resalte : f.seat.unused ? P.grisApagado : P.yeso
      const p = this.aPantalla(f.raiz.x, f.baseY)
      f.rotulo.position.set(Math.round(p.x), Math.round(p.y + 6))
    }

    for (const l of this.lomos) {
      const vivo = l.destelloHasta > ahora
      l.sprite.y = vivo ? l.baseY - 3 : l.baseY
      l.sprite.tint = vivo ? UI.destello : 0xffffff
    }
    for (const c of this.tarjetas) {
      c.sprite.tint = c.destelloHasta > ahora ? UI.destello : 0xffffff
    }
    for (const z of this.placas) {
      const p = this.aPantalla(z.mundoX, z.mundoY)
      z.position.set(Math.round(p.x), Math.round(p.y))
    }

    this.repartirRotulos()
    this.dibujarVistaMinimapa()
    this.dibujarAnillo(t)
    this.moverMotas(ms)
    this.colocarTooltip()
  }

  /**
   * Separa los rótulos que se pisan.
   *
   * Un escalonado fijo no sirve, y repartir por carriles tampoco: cada rótulo arranca a la altura
   * de SU figura, así que dos rótulos en carriles distintos pueden acabar a la misma altura en
   * pantalla. Lo único que funciona es comparar los rectángulos de verdad. El escalón sale de la
   * altura real del texto: bajar 12 px uno de 16 seguiría solapando.
   *
   * Las placas de los despachos entran como OBSTÁCULOS: marcan sitios y no se mueven.
   */
  private repartirRotulos(): void {
    const INTENTOS = 6
    const MARGEN_X = 5
    const HUECO = 3
    const colocados: { x0: number; x1: number; y0: number; y1: number }[] = this.placas.map(
      (z) => ({
        x0: z.x - z.width / 2 - MARGEN_X,
        x1: z.x + z.width / 2 + MARGEN_X,
        y0: z.y - z.height,
        y1: z.y + 2,
      }),
    )
    const ordenadas = this.figuras
      .filter((f) => f.rotulo.visible)
      .sort((a, b) => a.rotulo.x - b.rotulo.x)

    for (const f of ordenadas) {
      const mitad = f.rotulo.width / 2
      const x0 = f.rotulo.x - mitad - MARGEN_X
      const x1 = f.rotulo.x + mitad + MARGEN_X
      const alto = f.rotulo.height
      const escalon = Math.ceil(alto) + HUECO
      const base = f.rotulo.y
      let elegido = base
      for (let i = 0; i < INTENTOS; i++) {
        elegido = base + i * escalon
        const choca = colocados.some(
          (r) => x0 < r.x1 && x1 > r.x0 && elegido < r.y1 && elegido + alto > r.y0,
        )
        // Agotados los intentos se queda en el último: taparse un poco es mejor que empujar un
        // nombre tan lejos de su figura que ya no se sepa de quién es.
        if (!choca) break
      }
      f.rotulo.y = elegido
      colocados.push({ x0, x1, y0: elegido, y1: elegido + alto })
    }
  }

  /** Anillo bajo la figura seleccionada: late, para que no se pierda entre veinte. */
  private dibujarAnillo(t: number): void {
    this.anillo.clear()
    this.resalte.clear()
    if (!this.seleccion || !this.layout) return
    const todas = this.layout.bahias.flatMap((b) => b.agentes)
    const s = todas.find((x) => x.id === this.seleccion)
    const pos = s
      ? toScreen(s.col, s.row)
      : this.seleccion === this.idPrincipal
        ? toScreen(this.layout.main.col, this.layout.main.row)
        : null
    const pulso = (Math.sin(t * 3) + 1) * 0.5
    if (!pos) {
      this.dibujarResalte(pulso)
      return
    }
    this.anillo
      .ellipse(pos.x, pos.y + TILE.h / 2, 18 + pulso * 4, 9 + pulso * 2)
      .stroke({ color: UI.resalte, width: 2, alpha: 0.5 + pulso * 0.35 })
  }

  /** Marco pulsante alrededor del lomo o la tarjeta seleccionados (las figuras llevan anillo). */
  private dibujarResalte(pulso: number): void {
    const pieza = [...this.lomos, ...this.tarjetas, ...this.racks].find(
      (x) => x.id === this.seleccion,
    )
    if (!pieza) {
      // Un plugin no tiene una pieza: lo que se marca es el contorno de su despacho.
      const b = this.layout?.bahias.find((x) => x.plugin?.id === this.seleccion)
      if (!b) return
      const pts = [
        toScreen(b.col0, b.row0),
        toScreen(b.col1, b.row0),
        toScreen(b.col1, b.row1),
        toScreen(b.col0, b.row1),
      ].flatMap((p) => [p.x, p.y])
      this.resalte.poly(pts).stroke({ color: UI.resalte, width: 2, alpha: 0.45 + pulso * 0.35 })
      return
    }
    const s = pieza.sprite
    const x0 = s.x - s.width * s.anchor.x - 2
    const y0 = s.y - s.height * s.anchor.y - 2
    this.resalte
      .rect(x0, y0, s.width + 4, s.height + 4)
      .stroke({ color: UI.resalte, width: 2, alpha: 0.55 + pulso * 0.35 })
  }

  /**
   * Motas de polvo flotando en el foco del vestíbulo. Es el detalle más barato que existe para
   * que una escena quieta deje de parecer una captura de pantalla.
   */
  private moverMotas(ms: number): void {
    const centro = this.layout ? toScreen(this.layout.main.col, this.layout.main.row) : null
    if (centro && this.motas.length < 22 && Math.random() < 0.05) {
      const g = new Graphics()
      g.rect(0, 0, 1, 1).fill({ color: P.luz, alpha: 0.5 })
      g.position.set(centro.x + (Math.random() - 0.5) * 300, centro.y - 150 - Math.random() * 40)
      this.capaLuz.addChild(g)
      this.motas.push({
        g,
        vx: (Math.random() - 0.5) * 0.006,
        vy: 0.004 + Math.random() * 0.008,
        vida: 0,
      })
    }
    for (let i = this.motas.length - 1; i >= 0; i--) {
      const m = this.motas[i]
      if (!m) continue
      m.vida += ms
      m.g.x += m.vx * ms
      m.g.y += m.vy * ms
      m.g.alpha = Math.max(0, 0.55 - m.vida / 18000)
      if (m.vida > 18000) {
        m.g.destroy()
        this.motas.splice(i, 1)
      }
    }
  }

  private colocarTooltip(): void {
    if (!this.tooltip.visible) return
    const p = this.app.renderer.events.pointer.global
    this.tooltip.position.set(Math.round(p.x + 14), Math.round(p.y - 22))
    this.fondoTooltip
      .clear()
      .roundRect(
        this.tooltip.x - 6,
        this.tooltip.y - 4,
        this.tooltip.width + 12,
        this.tooltip.height + 8,
        3,
      )
      .fill({ color: UI.noche, alpha: 0.92 })
  }

  /** Mundo → pantalla, para colocar los rótulos del HUD (que no escala). */
  private aPantalla(x: number, y: number): { x: number; y: number } {
    const ox = this.layout ? origenX(this.layout.filas) : 0
    return {
      x: this.camara.x + (x + ox) * this.camara.escala,
      y: this.camara.y + y * this.camara.escala,
    }
  }

  /** Encaja la planta entera en el lienzo. Es el estado inicial: se ve todo de un vistazo. */
  encajar(): void {
    if (!this.layout) return
    this.camaraManual = false
    // El observador de tamaño ignora los cambios que llegan mientras cargan las texturas, así que
    // el renderer puede seguir con el tamaño de arranque (o el de antes de quitarse la pantalla de
    // carga). Encuadrar con ese tamaño dejaba la planta fuera de la vista: se sincroniza primero.
    if (this.estado === 'lista') this.app.resize()
    const w = this.app.renderer.width
    const h = this.app.renderer.height
    // La pared izquierda sobresale media baldosa del vértice del suelo; encuadrar sin contarlo
    // la recorta.
    const izquierda = -TILE.w / 2
    const ancho = anchoPlanta(this.layout.cols, this.layout.filas) + TILE.w / 2
    const alto = altoPlanta(this.layout.cols, this.layout.filas) + WALL_H
    const cabe = Math.min(w / (ancho + 40), h / (alto + 40))
    const escala = ESCALAS.filter((e) => e <= cabe).pop() ?? ESCALAS[0] ?? 1
    this.objetivo.escala = escala
    this.camara.escala = escala
    filtrarTodo(escala * this.dpr >= 1 ? 'nearest' : 'linear')
    this.objetivo.x = (w - ancho * escala) / 2 - izquierda * escala
    this.objetivo.y = (h - alto * escala) / 2 + WALL_H * escala
    this.camara.x = this.objetivo.x
    this.camara.y = this.objetivo.y
  }

  /** Pausa el bucle mientras la Sala está oculta: nadie ve 60 fps de una vista tapada. */
  activar(activa: boolean): void {
    if (this.estado !== 'lista') return
    if (activa) this.app.ticker.start()
    else this.app.ticker.stop()
  }

  destruir(): void {
    if (this.fueDestruida()) return
    const habiaIniciado = this.appIniciada
    this.estado = 'destruida'
    this.observador?.disconnect()
    // Si Pixi aún está arrancando, `iniciar()` desmonta la app al volver (ver arriba).
    if (habiaIniciado) this.app.destroy(true, { children: true })
    liberar(this.texturasDelSnapshot)
    this.texturasDelSnapshot = []
  }
}
