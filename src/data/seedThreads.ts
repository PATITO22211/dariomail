import type { MailThread, Participant } from '../types/mail';

export const CURRENT_USER: Participant = {
  name: 'Jorge Darío Gallegos',
  email: 'dario@dariomsi.com',
};

const ARCH_IMG = '/src/assets/images/newsletter_architecture_monolith_1795220715433.jpg';
const AUDIO_IMG = '/src/assets/images/newsletter_industrial_audio_1795220716248.jpg';
const AVATAR_ELENA = '/src/assets/images/avatar_elena_1795220715162.jpg';
const AVATAR_MARCUS = '/src/assets/images/avatar_marcus_1795220715743.jpg';

export const SEED_THREADS: MailThread[] = [
  {
    id: 'thr-elena-monograph',
    folder: 'inbox',
    subject: 'Pruebas de imprenta — Monografía Tipográfica Suiza 2026',
    unread: true,
    category: 'correspondence',
    updatedAt: '2026-11-20T16:12:00Z',
    messages: [
      {
        id: 'msg-elena-1',
        sender: {
          name: 'Elena Vance',
          email: 'elena@ateliervance.es',
          avatar: AVATAR_ELENA,
          role: 'Dirección Creativa',
        },
        recipients: ['dario@dariomsi.com'],
        timestamp: '2026-11-19T11:20:00Z',
        plainSnippet:
          'Dario, acabo de recibir el papel algodón de 140g desde Basilea. La caída del blanco hueso sobre la retícula es exactamente lo que buscábamos.',
        bodyHtml: `<p>Dario,</p>
<p>Acabo de recibir el papel algodón de 140g desde Basilea. La caída del blanco hueso sobre la retícula es exactamente lo que buscábamos: cero brillo clínico, una lectura serena incluso bajo luz cenital.</p>
<p>¿Te parece si revisamos los márgenes interiores del capítulo IV antes de enviar a fotomecánica?</p>
<p>Un abrazo,<br/>Elena</p>`,
      },
      {
        id: 'msg-elena-2',
        sender: CURRENT_USER,
        recipients: ['elena@ateliervance.es'],
        timestamp: '2026-11-19T14:48:00Z',
        plainSnippet:
          'Me encanta cómo respira el blanco hueso. Subí el margen del lomo 2.5 mm para que las notas al margen nunca queden atrapadas en el pliegue.',
        bodyHtml: `<p>Elena,</p>
<p>Me encanta cómo respira el blanco hueso. Subí el margen del lomo 2.5 mm para que las notas al margen nunca queden atrapadas en el pliegue.</p>
<p>También reduje la densidad de los filetes a 0.25pt; en el papel sin estucar se veían ligeramente pesados.</p>
<p>Dario</p>`,
      },
      {
        id: 'msg-elena-3',
        sender: {
          name: 'Elena Vance',
          email: 'elena@ateliervance.es',
          avatar: AVATAR_ELENA,
          role: 'Dirección Creativa',
        },
        recipients: ['dario@dariomsi.com'],
        timestamp: '2026-11-20T16:12:00Z',
        plainSnippet:
          'Aprobado en prensa. El filete de 0.25pt desaparece cuando no lo buscas y ordena la página en silencio. Te dejo el pliego final listo para firma.',
        bodyHtml: `<p>Aprobado en prensa.</p>
<p>El filete de 0.25pt desaparece cuando no lo buscas y ordena la página en silencio. Exactamente ese punto de precisión que separa un catálogo de un libro de colección.</p>
<blockquote>«El espacio en blanco no es ausencia de contenido; es el instrumento que permite escuchar a la tipografía.»</blockquote>
<p>Te dejo el pliego final listo para tu visto bueno antes de las 18:00. Si confirmas hoy, encuadernamos el lunes.</p>
<p>Elena</p>`,
        attachments: [
          { name: 'Monografia_Pliego_04_Final.pdf', size: '18.4 MB', kind: 'pdf' },
        ],
      },
    ],
  },
  {
    id: 'thr-monolith-newsletter',
    folder: 'inbox',
    subject: 'Edición 42 · Silencio en Hormigón y Travertino',
    unread: true,
    category: 'newsletter',
    updatedAt: '2026-11-20T14:35:00Z',
    messages: [
      {
        id: 'msg-monolith-1',
        sender: {
          name: 'Monolith Press',
          email: 'dispatch@monolithpress.jp',
        },
        recipients: ['dario@dariomsi.com'],
        timestamp: '2026-11-20T14:35:00Z',
        isHtmlRich: true,
        plainSnippet:
          'Cuaderno de arquitectura contemporánea desde Kioto: cómo la luz de las cuatro de la tarde dibuja geometrías vivas sin añadir ornamento.',
        bodyHtml: `
          <article class="editorial-dispatch">
            <p class="kicker">Monolith Press · Edición 42 · Kioto</p>
            <h1>Silencio en Hormigón y Travertino</h1>
            <p class="lead">Un recorrido fotográfico por el Pabellón Kamo: tres planos de hormigón visto, agua quieta y un jardín de musgo que absorbe el rumor urbano.</p>
            <figure>
              <img src="${ARCH_IMG}" alt="Pabellón arquitectónico minimalista de hormigón y travertino en Kioto bajo luz de tarde" />
              <figcaption>Luz oblicua a las 16:15 sobre losa de travertino romano sin pulir. Fotografía de Kenji Sato.</figcaption>
            </figure>
            <p>Cuando se retiran los marcos superfluos, el ojo descansa. El arquitecto evita cualquier transición abrupta entre interior y exterior: el pasillo cubierto se alarga como una pausa respiratoria antes de alcanzar la galería de madera de cedro.</p>
            <div class="meta-row">
              <span>Lectura de 6 min</span>
              <span>·</span>
              <span>Archivo Otoño 2026</span>
            </div>
          </article>
        `,
      },
    ],
  },
  {
    id: 'thr-marcus-acoustics',
    folder: 'inbox',
    subject: 'Sistema de micro-interacciones y curva de resorte — Fase II',
    unread: true,
    category: 'correspondence',
    updatedAt: '2026-11-20T11:50:00Z',
    messages: [
      {
        id: 'msg-marcus-1',
        sender: {
          name: 'Marcus Lindqvist',
          email: 'marcus@lindqvist-studio.ch',
          avatar: AVATAR_MARCUS,
          role: 'Arquitecto de Interacción',
        },
        recipients: ['dario@dariomsi.com'],
        timestamp: '2026-11-18T09:15:00Z',
        plainSnippet:
          'Dario, probamos rigidez 420 con amortiguación 34 en el menú lateral. Se siente rápido pero pierde la tensión líquida al saltar dos posiciones.',
        bodyHtml: `<p>Dario,</p>
<p>Probamos rigidez 420 con amortiguación 34 en el menú lateral. Se siente rápido pero pierde la tensión líquida al saltar dos posiciones.</p>
<p>Propongo bajar rigidez a 360 y masa a 0.85 para conservar esa sensación de mercurio sereno.</p>
<p>Marcus</p>`,
      },
      {
        id: 'msg-marcus-2',
        sender: CURRENT_USER,
        recipients: ['marcus@lindqvist-studio.ch'],
        timestamp: '2026-11-18T15:02:00Z',
        plainSnippet:
          'Coincido. Lo probé en 120Hz y con stiffness 360 el desplazamiento tiene peso físico sin parecer gelatinoso.',
        bodyHtml: `<p>Coincido totalmente, Marcus.</p>
<p>Lo probé en pantalla de 120Hz y con <code>stiffness: 360, damping: 28</code> el desplazamiento tiene peso físico real sin parecer gelatinoso ni juguetón.</p>
<p>¿Cerramos los parámetros para la sala de lectura esta semana?</p>`,
      },
      {
        id: 'msg-marcus-3',
        sender: {
          name: 'Marcus Lindqvist',
          email: 'marcus@lindqvist-studio.ch',
          avatar: AVATAR_MARCUS,
          role: 'Arquitecto de Interacción',
        },
        recipients: ['dario@dariomsi.com'],
        timestamp: '2026-11-19T18:22:00Z',
        plainSnippet:
          'Adjunto el borrador de la transición de lista a lectura: el asunto conserva su proyección espacial mientras el cuerpo entra desde el fondo.',
        bodyHtml: `<p>Adjunto las notas de la transición de lista a lectura.</p>
<p>Al hacer clic en un hilo, el asunto conserva su eje horizontal y el cuerpo entra con un leve ascenso de 14px en <code>cubic-bezier(0.16, 1, 0.3, 1)</code>. Cero parpadeos, cero cortes secos.</p>`,
      },
      {
        id: 'msg-marcus-4',
        sender: {
          name: 'Marcus Lindqvist',
          email: 'marcus@lindqvist-studio.ch',
          avatar: AVATAR_MARCUS,
          role: 'Arquitecto de Interacción',
        },
        recipients: ['dario@dariomsi.com'],
        timestamp: '2026-11-20T11:50:00Z',
        plainSnippet:
          'Confirmado por el equipo de Zúrich: la paleta de comandos radial bajo Cmd+K responde en menos de 16ms. Lista para producción.',
        bodyHtml: `<p>Confirmado por el equipo de Zúrich.</p>
<p>La paleta de comandos radial bajo <code>Cmd + K</code> responde en menos de 16ms y el selector líquido comparte exactamente la misma física que la navegación lateral.</p>
<p>Cuando quieras hacemos una sesión breve para revisar la iluminación del acento <code>#77fcf6</code> sobre el modo lino claro.</p>
<p>Un saludo,<br/>Marcus</p>`,
      },
    ],
  },
  {
    id: 'thr-klangwerk-audio',
    folder: 'inbox',
    subject: 'Klangwerk Reference 01 — Aluminio Anodizado sobre Basalto',
    unread: false,
    category: 'newsletter',
    updatedAt: '2026-11-20T09:10:00Z',
    messages: [
      {
        id: 'msg-klangwerk-1',
        sender: {
          name: 'Klangwerk Audio',
          email: 'editions@klangwerk.de',
        },
        recipients: ['dario@dariomsi.com'],
        timestamp: '2026-11-20T09:10:00Z',
        isHtmlRich: true,
        plainSnippet:
          'Presentamos el controlador rotativo mecanizado en bloque sólido de aluminio serie 6061. Disponible en serie numerada de 150 unidades.',
        bodyHtml: `
          <article class="editorial-dispatch">
            <p class="kicker">Klangwerk · Múnich · Serie Reference 01</p>
            <h1>Precisión táctil sin pantallas</h1>
            <p class="lead">Un dial sólido de 420 gramos con rodamientos ópticos sin fricción y moleteado micro-diamante. Diseñado para desaparecer en tu escritorio y responder al primer toque.</p>
            <figure>
              <img src="${AUDIO_IMG}" alt="Controlador rotativo de aluminio anodizado mate y giradiscos minimalista sobre piedra de basalto" />
              <figcaption>Anodizado grafito mate sobre piedra de basalto natural. Edición numerada 001–150.</figcaption>
            </figure>
            <p>Cada unidad se calibra a mano en nuestro taller de Múnich para ofrecer una inercia exactamente proporcional a la velocidad de giro. Tu reserva prioritaria permanece abierta hasta el 30 de noviembre.</p>
          </article>
        `,
      },
    ],
  },
  {
    id: 'thr-invoice-linear',
    folder: 'inbox',
    subject: 'Factura #DM-2026-1104 · Infraestructura y Dominio dariomsi.com',
    unread: false,
    category: 'invoice',
    updatedAt: '2026-11-19T19:05:00Z',
    messages: [
      {
        id: 'msg-invoice-1',
        sender: {
          name: 'Nordic Cloud Billing',
          email: 'facturacion@nordiccloud.eu',
        },
        recipients: ['dario@dariomsi.com'],
        timestamp: '2026-11-19T19:05:00Z',
        isHtmlRich: true,
        plainSnippet:
          'Resumen mensual de factura correspondiente a noviembre 2026. Importe liquidado: 84,00 € · Cargo automático completado.',
        bodyHtml: `
          <article class="invoice-doc">
            <p class="kicker">Comprobante de Factura · #DM-2026-1104</p>
            <h1>Resumen de servicios — Noviembre 2026</h1>
            <p>Emitido para <strong>Dario Morales (inbox.dariomsi.com)</strong>. Pago liquidado automáticamente el 19 de noviembre de 2026.</p>
            <table>
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th class="num">Periodo</th>
                  <th class="num">Importe</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Nodo dedicado correo cifrado EU-Central</td>
                  <td class="num">01–30 Nov</td>
                  <td class="num">56,00 €</td>
                </tr>
                <tr>
                  <td>Almacenamiento NVMe de archivo (500 GB)</td>
                  <td class="num">01–30 Nov</td>
                  <td class="num">18,00 €</td>
                </tr>
                <tr>
                  <td>Renovación DNSSEC &amp; TLS dariomsi.com</td>
                  <td class="num">Anual</td>
                  <td class="num">10,00 €</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2">Total liquidado (IVA incluido)</td>
                  <td class="num">84,00 €</td>
                </tr>
              </tfoot>
            </table>
          </article>
        `,
        attachments: [
          { name: 'Factura_DM-2026-1104.pdf', size: '142 KB', kind: 'pdf' },
        ],
      },
    ],
  },
  {
    id: 'thr-invoice-foundry',
    folder: 'inbox',
    subject: 'Factura #TF-8841 · Licencia Tipográfica Editorial Plus & Mono',
    unread: false,
    category: 'invoice',
    updatedAt: '2026-11-18T13:40:00Z',
    messages: [
      {
        id: 'msg-invoice-2',
        sender: {
          name: 'Helvetia Type Foundry',
          email: 'billing@helvetiatype.ch',
        },
        recipients: ['dario@dariomsi.com'],
        timestamp: '2026-11-18T13:40:00Z',
        isHtmlRich: true,
        plainSnippet:
          'Gracias por tu licencia comercial de escritorio y web. Factura #TF-8841 por valor de 320,00 CHF disponible en tu archivo.',
        bodyHtml: `
          <article class="invoice-doc">
            <p class="kicker">Helvetia Type Foundry · Factura #TF-8841</p>
            <h1>Licencia Tipográfica — Estudio Independiente</h1>
            <p>Licencia perpetua para uso editorial, aplicación web y correspondencia en <strong>inbox.dariomsi.com</strong>.</p>
            <table>
              <thead>
                <tr>
                  <th>Familia</th>
                  <th class="num">Puestos</th>
                  <th class="num">Importe</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Neue Grotesk Pro — Pesos 400 / 500 / 600</td>
                  <td class="num">1–5</td>
                  <td class="num">210,00 CHF</td>
                </tr>
                <tr>
                  <td>Tabular Mono Precision — Cifras tabulares</td>
                  <td class="num">1–5</td>
                  <td class="num">110,00 CHF</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2">Total abonado</td>
                  <td class="num">320,00 CHF</td>
                </tr>
              </tfoot>
            </table>
          </article>
        `,
      },
    ],
  },
  {
    id: 'thr-clara-cena',
    folder: 'inbox',
    subject: 'Mesa reservada en Bar Brutal — Viernes 21:30',
    unread: false,
    category: 'personal',
    updatedAt: '2026-11-17T20:18:00Z',
    messages: [
      {
        id: 'msg-clara-1',
        sender: {
          name: 'Clara Soler',
          email: 'clara@solerestudio.com',
        },
        recipients: ['dario@dariomsi.com'],
        timestamp: '2026-11-17T20:18:00Z',
        plainSnippet:
          'Confirmada la mesa al fondo junto a la bodega para las 21:30. Traigo las muestras de cerámica sin esmaltar para que las veas con calma.',
        bodyHtml: `<p>Dario,</p>
<p>Confirmada la mesa al fondo junto a la bodega para el viernes a las 21:30. Pedí el rincón tranquilo para poder conversar sin música alta.</p>
<p>Traigo las dos muestras de cerámica sin esmaltar para que las veas con calma.</p>
<p>Nos vemos el viernes,<br/>Clara</p>`,
      },
    ],
  },
  {
    id: 'thr-sent-tokyo',
    folder: 'sent',
    subject: 'Confirmación de estancia — Hotel K5 Tokio',
    unread: false,
    category: 'personal',
    updatedAt: '2026-11-19T10:05:00Z',
    messages: [
      {
        id: 'msg-sent-1',
        sender: CURRENT_USER,
        recipients: ['concierge@k5-tokyo.com'],
        timestamp: '2026-11-19T10:05:00Z',
        plainSnippet:
          'Buenos días, confirmo mi llegada el 4 de diciembre a las 16:00. Agradecería una habitación en planta superior orientada al patio interior.',
        bodyHtml: `<p>Buenos días,</p>
<p>Confirmo mi llegada el próximo 4 de diciembre alrededor de las 16:00. Si hubiera disponibilidad, agradecería una habitación en planta superior orientada al patio interior.</p>
<p>Muchas gracias,<br/>Dario Morales</p>`,
      },
    ],
  },
  {
    id: 'thr-sent-manifesto',
    folder: 'sent',
    subject: 'Notas de diseño — Arquitectura Zero-Container v1',
    unread: false,
    category: 'correspondence',
    updatedAt: '2026-11-16T17:42:00Z',
    messages: [
      {
        id: 'msg-sent-2',
        sender: CURRENT_USER,
        recipients: ['elena@ateliervance.es', 'marcus@lindqvist-studio.ch'],
        timestamp: '2026-11-16T17:42:00Z',
        plainSnippet:
          'Comparto el principio rector: eliminar todo borde que no cumpla una función estructural y reservar el acento #77fcf6 exclusivamente para señales vivas.',
        bodyHtml: `<p>Hola a los dos,</p>
<p>Comparto el principio rector para la siguiente iteración: eliminar todo borde que no cumpla una función estructural y reservar el acento <code>#77fcf6</code> exclusivamente para señales vivas.</p>
<p>Cuanto menos ruido visual procese el lector, mayor claridad tendrá su pensamiento al responder.</p>
<p>Dario</p>`,
      },
    ],
  },
  {
    id: 'thr-draft-editorial',
    folder: 'drafts',
    subject: 'Borrador: Carta anual sobre instrumentos digitales silenciosos',
    unread: false,
    category: 'correspondence',
    updatedAt: '2026-11-20T15:05:00Z',
    draftTo: 'elena@ateliervance.es',
    draftBodyHtml: `<p>Elena,</p><p>Llevo semanas escribiendo un ensayo breve sobre por qué el software cotidiano debería sentirse más cercano a una cámara analógica que a un tablero de control aéreo.</p><p>Te paso el primer borrador en cuanto pula el cierre del tercer párrafo.</p>`,
    messages: [
      {
        id: 'msg-draft-1',
        sender: CURRENT_USER,
        recipients: ['elena@ateliervance.es'],
        timestamp: '2026-11-20T15:05:00Z',
        plainSnippet:
          'Llevo semanas escribiendo un ensayo breve sobre por qué el software cotidiano debería sentirse más cercano a una cámara analógica...',
        bodyHtml: `<p>Elena,</p><p>Llevo semanas escribiendo un ensayo breve sobre por qué el software cotidiano debería sentirse más cercano a una cámara analógica que a un tablero de control aéreo.</p><p>Te paso el primer borrador en cuanto pula el cierre del tercer párrafo.</p>`,
      },
    ],
  },
  {
    id: 'thr-archive-museum',
    folder: 'archive',
    subject: 'Invitación privada — Retrospectiva Dieter Rams, Fráncfort',
    unread: false,
    category: 'correspondence',
    updatedAt: '2026-11-10T12:30:00Z',
    messages: [
      {
        id: 'msg-archive-1',
        sender: {
          name: 'Museum Angewandte Kunst',
          email: 'curatorial@mak-frankfurt.de',
        },
        recipients: ['dario@dariomsi.com'],
        timestamp: '2026-11-10T12:30:00Z',
        plainSnippet:
          'Nos complace invitarle al recorrido matutino sin público por la colección permanente «Weniger, aber besser».',
        bodyHtml: `<p>Estimado Sr. Morales,</p>
<p>Nos complace invitarle al recorrido matutino sin público por la colección permanente «Weniger, aber besser», el sábado 28 de noviembre a las 09:00.</p>
<p>Atentamente,<br/>Departamento Curatorial</p>`,
      },
    ],
  },
  {
    id: 'thr-archive-tax',
    folder: 'archive',
    subject: 'Factura #ES-902 · Gestoría Trimestral Q3 2026',
    unread: false,
    category: 'invoice',
    updatedAt: '2026-11-04T09:14:00Z',
    messages: [
      {
        id: 'msg-archive-2',
        sender: {
          name: 'Asesoría Roldán',
          email: 'contabilidad@roldan.es',
        },
        recipients: ['dario@dariomsi.com'],
        timestamp: '2026-11-04T09:14:00Z',
        plainSnippet:
          'Presentación del tercer trimestre completada sin incidencias. Adjuntamos resguardo y factura de honorarios.',
        bodyHtml: `<p>Buenos días Dario,</p>
<p>La presentación fiscal del tercer trimestre ha quedado tramitada sin incidencias. Queda archivada en tu carpeta de facturas del ejercicio 2026.</p>`,
      },
    ],
  },
  {
    id: 'thr-trash-promo',
    folder: 'trash',
    subject: 'Últimas horas: oferta flash de almacenamiento ilimitado',
    unread: false,
    category: 'newsletter',
    updatedAt: '2026-11-12T08:02:00Z',
    messages: [
      {
        id: 'msg-trash-1',
        sender: {
          name: 'CloudVault Deals',
          email: 'promo@cloudvault.example',
        },
        recipients: ['dario@dariomsi.com'],
        timestamp: '2026-11-12T08:02:00Z',
        plainSnippet:
          'Descuento promocional del 40% durante las próximas 24 horas en planes anuales.',
        bodyHtml: `<p>Descuento promocional del 40% durante las próximas 24 horas en planes anuales.</p>`,
      },
    ],
  },
  {
    id: 'thr-trash-old-alert',
    folder: 'trash',
    subject: 'Resumen automático semanal de métricas heredadas',
    unread: false,
    category: 'newsletter',
    updatedAt: '2026-11-09T07:00:00Z',
    messages: [
      {
        id: 'msg-trash-2',
        sender: {
          name: 'Legacy Analytics',
          email: 'noreply@legacy-metrics.example',
        },
        recipients: ['dario@dariomsi.com'],
        timestamp: '2026-11-09T07:00:00Z',
        plainSnippet:
          'Informe semanal automatizado archivado en papelera tras la migración del panel.',
        bodyHtml: `<p>Informe semanal automatizado movido a papelera tras la migración del panel.</p>`,
      },
    ],
  },
];
