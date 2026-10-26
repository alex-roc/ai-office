import { useState } from 'react'
import { Dialogo } from './Dialogo.tsx'

/** Panel de ayuda (`?`): atajos de teclado y cómo leer cada vista. */

const ATAJOS: { teclas: string; que: string }[] = [
  { teclas: '1', que: 'ver la Sala' },
  { teclas: '2', que: 'ver el Plano' },
  { teclas: '/', que: 'buscar un agente, skill o comando y llevar la vista hasta él' },
  { teclas: '+  −', que: 'acercar o alejar' },
  { teclas: '0', que: 'encuadrar todo' },
  { teclas: 'Esc', que: 'cerrar el diálogo abierto o quitar la selección' },
  { teclas: '?', que: 'abrir esta ayuda' },
]

export const Ayuda = ({ onCerrar }: { onCerrar: () => void }) => (
  <Dialogo titulo="Ayuda" onCerrar={onCerrar} claseModal="ayuda">
    <h4 className="sub-ayuda">Atajos de teclado</h4>
    <dl className="atajos">
      {ATAJOS.map((a) => (
        <div key={a.teclas}>
          <dt>
            <kbd>{a.teclas}</kbd>
          </dt>
          <dd>{a.que}</dd>
        </div>
      ))}
    </dl>
    <p className="nota-dialogo">
      Los atajos no actúan mientras escribes en un campo de texto ni con un diálogo abierto.
    </p>

    <h4 className="sub-ayuda">Cómo leer la Sala</h4>
    <ul className="leyenda-lista">
      <li>
        Cada <b>despacho</b> agrupa agentes que citan las mismas skills o que convocan los mismos
        comandos; la placa de la puerta dice por qué.
      </li>
      <li>
        <b>Persona en gris</b>: agente al que nunca has delegado. En color: ya ha trabajado.
      </li>
      <li>
        <b>Lomo</b> de una skill: su alto es el grado (sin estrenar, estrenada, en práctica,
        acreditada) y su color, el agente que más la usa. Sin tejuelo dorado: nunca usada.
      </li>
      <li>
        <b>Archivo común</b>: skills que cita media planta. <b>Depósito</b>: skills que no cita
        ningún agente.
      </li>
      <li>
        <b>Tarjeta</b> clavada en la mampara: un comando. Chincheta roja, se ha ejecutado; gris,
        nunca.
      </li>
    </ul>

    <h4 className="sub-ayuda">Cómo leer el Plano</h4>
    <ul className="leyenda-lista">
      <li>
        Línea <b>punteada</b>: lo que tus prompts dicen que debería pasar. Línea <b>sólida verde</b>
        : lo que los transcripts demuestran que pasó. La distancia entre ambas es el trabajo
        pendiente.
      </li>
      <li>Círculo: agente. Cuadrado: skill. Rectángulo: comando. Relleno vacío: nunca usado.</li>
      <li>
        <b>editar grafo</b> (solo en el Plano): arrastra de un agente a una skill para escribir esa
        relación en su prompt. Siempre se enseña el diff antes de tocar el archivo.
      </li>
    </ul>
    <div className="acciones">
      <button type="button" className="primario" onClick={onCerrar}>
        Entendido
      </button>
    </div>
  </Dialogo>
)

const CLAVE_BIENVENIDA = 'ai-office-bienvenida'

const yaVista = (): boolean => {
  try {
    return localStorage.getItem(CLAVE_BIENVENIDA) === '1'
  } catch {
    return false
  }
}

/** Banda de bienvenida, solo la primera vez. Descartarla se recuerda en `localStorage`. */
export const Bienvenida = ({ onAyuda }: { onAyuda: () => void }) => {
  const [visible, setVisible] = useState(() => !yaVista())
  if (!visible) return null
  const descartar = () => {
    try {
      localStorage.setItem(CLAVE_BIENVENIDA, '1')
    } catch {
      /* sin almacenamiento: se mostrará otra vez la próxima, no pasa nada */
    }
    setVisible(false)
  }
  return (
    <section className="bienvenida" aria-label="Bienvenida">
      <div>
        <h2>Esto es tu configuración de Claude Code, cruzada con lo que de verdad pasó</h2>
        <ul>
          <li>
            <b>Sala</b>: una oficina donde cada agente es una persona, cada skill un lomo en una
            balda y cada comando una tarjeta. Lo gris es lo que nunca has usado.
          </li>
          <li>
            <b>Plano</b>: el mismo catálogo como grafo. Punteado = lo que tus prompts dicen; sólido
            = lo que los transcripts demuestran.
          </li>
          <li>
            <b>Ficha</b> (a la derecha): pulsa cualquier cosa para ver qué dice de sí misma, qué ha
            hecho y de qué archivo sale cada dato. Desde ahí puedes editarla, siempre con diff.
          </li>
        </ul>
      </div>
      <div className="bienvenida-acciones">
        <button type="button" onClick={onAyuda}>
          Ver atajos
        </button>
        <button type="button" className="primario" onClick={descartar}>
          Entendido
        </button>
      </div>
    </section>
  )
}
