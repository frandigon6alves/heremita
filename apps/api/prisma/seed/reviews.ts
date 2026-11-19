import type { GazetteerName } from './trips.js';
import type { SeedUserHandle } from './users.js';

/** [author, rating, visited month (YYYY-MM), body]. The language is the author's UI locale. */
type SeedReviewRow = [SeedUserHandle, 1 | 2 | 3 | 4 | 5, string, string];

// Written for the seed; not taken from any review site. Eight places get six
// reviews (enough for an average), most get one to five (count only), the rest none.
export const SEED_REVIEWS: Partial<Record<GazetteerName, SeedReviewRow[]>> = {
  torreDeBelem: [
    ['demo', 5, '2025-06', 'Get there before 10:00; after that the queue to go up doubles.'],
    [
      'ana',
      4,
      '2025-09',
      'Bonita por fora, apertada por dentro. A escada em caracol tem semáforo.',
    ],
    [
      'bruno',
      4,
      '2026-01',
      'Vale mais pela vista do rio do que pelo interior. Ingresso combinado compensa.',
    ],
    ['carla', 3, '2026-03', 'Achei pequena para o tempo de fila. Fotos de fora já resolvem.'],
    ['diego', 5, '2025-11', 'Fui al final de la tarde: luz perfecta y casi nadie en el jardín.'],
    [
      'elena',
      4,
      '2026-05',
      'Smaller than expected, but the riverside walk from Belém makes it worth it.',
    ],
  ],
  casteloDeSaoJorge: [
    ['demo', 4, '2026-02', 'The climb is steep; tram 28 drops you close by. Bring water.'],
    ['ana', 5, '2025-10', 'Melhor vista de Lisboa. Os pavões andam soltos pelo pátio.'],
    [
      'bruno',
      4,
      '2026-04',
      'Comprei o bilhete online e entrei direto. As muralhas valem a volta inteira.',
    ],
    ['carla', 4, '2025-07', 'Muito sol ao meio-dia e pouca sombra. Melhor ir cedo.'],
    ['diego', 3, '2026-06', 'Bonito, pero caro para lo que hay dentro. Lo mejor es la vista.'],
    ['elena', 5, '2026-05', 'Go at opening time: you get the walls almost to yourself.'],
  ],
  pasteisDeBelem: [
    ['demo', 5, '2025-06', 'The counter queue moves fast. Ask for cinnamon and sugar on the side.'],
    ['ana', 5, '2025-12', 'Lá dentro há salas enormes; quase sempre tem mesa livre.'],
    ['bruno', 4, '2026-04', 'Ótimo, mas não achei tão diferente das outras pastelarias do bairro.'],
    ['carla', 5, '2026-02', 'Saem quentes do forno o dia todo. Levei uma caixa de seis.'],
    [
      'diego',
      4,
      '2025-08',
      'Precio justo, atención con prisas. Me los comí en el jardín de enfrente.',
    ],
    ['elena', 5, '2026-05', 'Skip the takeaway queue and walk in: the tables turn over fast.'],
  ],
  cristoRedentor: [
    ['demo', 5, '2025-04', 'Took the first train from Cosme Velho and beat the tour groups.'],
    ['ana', 4, '2025-12', 'Vista inesquecível, mas a plataforma lota muito depois das 10h.'],
    ['bruno', 3, '2026-01', 'Fui num dia nublado e não vi nada. Confira a câmera ao vivo antes.'],
    ['carla', 5, '2026-02', 'Valeu cada minuto de fila. Leve casaco, venta bastante lá em cima.'],
    ['diego', 4, '2025-10', 'La furgoneta oficial desde Copacabana fue más práctica que el tren.'],
    ['elena', 5, '2026-03', 'Clear morning, short queue on the first train. Stunning.'],
  ],
  masp: [
    ['demo', 5, '2026-01', 'The glass easels make the collection feel new. Free on Tuesdays.'],
    ['ana', 5, '2025-11', 'Acervo incrível e bem montado. Reserve duas horas no mínimo.'],
    ['bruno', 4, '2026-03', 'Exposição temporária fraca, mas o acervo permanente compensa.'],
    [
      'carla',
      4,
      '2025-08',
      'O vão livre aos domingos tem feira de antiguidades. Combine as duas coisas.',
    ],
    ['diego', 3, '2026-06', 'Mucha fila el martes gratuito. Vale la pena pagar e ir otro día.'],
    ['elena', 5, '2026-04', 'The glass easels are unlike any museum I know. Free on Tuesdays.'],
  ],
  tourEiffel: [
    ['demo', 4, '2025-09', 'Walked up the stairs to the second floor: cheaper and no queue.'],
    ['ana', 3, '2026-02', 'Linda, mas muito cheia. A vista do Trocadéro é melhor para fotos.'],
    [
      'bruno',
      4,
      '2025-10',
      'Reserve o horário do topo com antecedência; esgotou para o mesmo dia.',
    ],
    ['carla', 5, '2026-07', 'À noite, quando pisca na hora cheia, é emocionante.'],
    ['diego', 2, '2026-05', 'Control de seguridad lentísimo y mucha gente vendiendo recuerdos.'],
    ['elena', 4, '2026-09', 'Take the stairs to the second floor, then the lift. Half the queue.'],
  ],
  mosteiroDosJeronimos: [
    ['ana', 5, '2025-10', 'O claustro é a parte mais bonita. A igreja tem entrada gratuita.'],
    ['carla', 4, '2026-02', 'Fila grande; o bilhete combinado com a Torre de Belém ajuda.'],
    [
      'diego',
      4,
      '2026-06',
      'Arquitectura impresionante. El domingo por la mañana estaba tranquilo.',
    ],
    ['elena', 5, '2026-05', 'The cloister alone is worth the ticket. Go right at opening.'],
  ],
  miradouroDeSantaLuzia: [
    [
      'demo',
      5,
      '2026-02',
      'Lovely tiles and a view over the river. Perfect in the late afternoon.',
    ],
    ['bruno', 4, '2026-04', 'Cheio de turistas, mas a vista compensa. Tem músico quase sempre.'],
    ['elena', 4, '2026-05', 'Small terrace, great tiles, packed at sunset.'],
  ],
  timeOutMarket: [
    ['carla', 4, '2026-02', 'Muitas opções num lugar só. Difícil achar mesa no almoço.'],
    [
      'diego',
      2,
      '2026-06',
      'Sitio para turistas, comida cara y demasiado ruido. No lo recomiendo.',
    ],
    ['elena', 4, '2026-05', 'Handy when the group cannot agree on one place to eat.'],
  ],
  elevadorDeSantaJusta: [
    ['bruno', 3, '2026-04', 'Fila de meia hora para um trajeto curto. Suba a pé pelo Carmo.'],
    ['carla', 4, '2025-07', 'O mirante lá em cima é bonito. Ingresso do elétrico vale aqui.'],
  ],
  aBrasileira: [
    [
      'bruno',
      4,
      '2026-04',
      'Café clássico do Chiado. Peça uma bica no balcão, sai bem mais barato.',
    ],
    ['elena', 3, '2026-05', 'Beautiful room, average coffee, tourist prices on the terrace.'],
  ],
  lxFactory: [
    ['bruno', 5, '2026-04', 'Livraria enorme e boas lojas pequenas. Domingo tem feira.'],
    ['diego', 4, '2025-08', 'Bueno para comer y pasear. Queda lejos del centro: ve en tranvía.'],
  ],
  oceanarioDeLisboa: [
    ['ana', 5, '2025-10', 'O tanque central é hipnotizante. Programa ótimo para dia de chuva.'],
    ['elena', 4, '2026-05', 'Well laid out; the central tank is the highlight. Book online.'],
  ],
  seDeLisboa: [
    ['carla', 4, '2025-07', 'Igreja austera e bonita, rápida de visitar no caminho para Alfama.'],
  ],
  cervejariaRamiro: [
    ['ana', 5, '2025-10', 'Frutos do mar ótimos. Termine com o prego, como todo mundo faz.'],
    ['bruno', 4, '2026-04', 'Fila na porta mesmo às 22h, mas anda. Sem reserva.'],
  ],
  pensaoAmor: [
    [
      'diego',
      4,
      '2025-08',
      'Bar curioso en un antiguo hotel. Buena música y cócteles bien hechos.',
    ],
  ],
  paoDeAcucar: [
    ['ana', 5, '2025-12', 'Vá no fim da tarde e espere o pôr do sol no segundo morro.'],
    [
      'bruno',
      4,
      '2026-01',
      'Bondinho rápido e organizado. A trilha do Morro da Urca é uma alternativa.',
    ],
    ['carla', 5, '2026-02', 'A vista da Baía de Guanabara é de tirar o fôlego.'],
    [
      'diego',
      4,
      '2025-10',
      'La entrada es cara, pero la experiencia lo vale. Poca fila a las 8:00.',
    ],
    ['elena', 5, '2026-03', 'Sunset from the top was the best moment of the whole trip.'],
  ],
  escadariaSelaron: [
    ['carla', 4, '2026-02', 'Muito colorida, ótima para fotos cedo, antes da multidão.'],
    ['diego', 3, '2025-10', 'Bonita, pero abarrotada. Vigila tus cosas.'],
    ['elena', 5, '2026-03', 'Look for the tiles from your home country. We found three.'],
  ],
  praiaDeIpanema: [
    ['bruno', 5, '2026-01', 'Fim de tarde no Arpoador com aplauso para o sol. Imperdível.'],
    ['elena', 4, '2026-03', 'Great beach, but bring only what you need to the sand.'],
  ],
  confeitariaColombo: [
    ['ana', 4, '2025-12', 'Salão lindo, doces bons, fila no fim de semana.'],
    ['carla', 3, '2026-02', 'O lugar é mais bonito que a comida. Vale pelo café da tarde.'],
  ],
  museuDoAmanha: [
    ['carla', 4, '2026-02', 'Arquitetura incrível. A exposição é rápida, duas horas bastam.'],
    ['diego', 5, '2025-10', 'Interactivo y bien pensado. Los martes la entrada es gratuita.'],
  ],
  arcosDaLapa: [['bruno', 4, '2026-01', 'Bonito à noite, mas vá em grupo e de táxi na volta.']],
  mercadoMunicipal: [
    ['carla', 4, '2025-08', 'O sanduíche de mortadela é enorme: divida com alguém.'],
    ['diego', 5, '2026-03', 'Vidrieras preciosas y fruta para probar. Ve con hambre.'],
    ['elena', 3, '2026-04', 'Fun to walk around, but the fruit sellers push hard.'],
  ],
  parqueIbirapuera: [
    ['ana', 5, '2025-11', 'Alugue bicicleta e passe pelo Museu Afro e pela Oca.'],
    ['diego', 4, '2026-03', 'El domingo se llena, pero es el mejor plan gratuito de la ciudad.'],
  ],
  pinacoteca: [
    ['ana', 5, '2025-11', 'Prédio lindo e acervo brasileiro excelente. Sábado é grátis.'],
    ['diego', 4, '2026-03', 'Combínala con la Estação da Luz, que está al lado.'],
  ],
  becoDoBatman: [
    ['carla', 4, '2025-08', 'Grafites renovados com frequência. Vá de manhã, à tarde lota.'],
  ],
  barBrahma: [
    ['diego', 4, '2026-03', 'Cerveza de barril helada y samba en vivo en la esquina más famosa.'],
  ],
  louvre: [
    ['ana', 4, '2026-02', 'Enorme. Escolha três alas antes de entrar ou você se perde.'],
    ['carla', 5, '2026-07', 'Entrei pelo Carrousel e quase não peguei fila.'],
    ['elena', 4, '2026-09', 'Book the earliest slot and go straight to the Denon wing.'],
  ],
  museeDOrsay: [
    [
      'bruno',
      5,
      '2025-10',
      'Os impressionistas no último andar e o relógio gigante. Favorito em Paris.',
    ],
    ['elena', 5, '2026-09', 'Thursday evening opening is quieter. The clock window view is great.'],
  ],
  sainteChapelle: [['elena', 5, '2026-09', 'Go on a sunny morning: the stained glass is unreal.']],
  cafeDeFlore: [
    ['carla', 3, '2026-07', 'Caro e cheio de turistas, mas o chocolate quente é ótimo.'],
    ['elena', 3, '2026-09', 'Classic room, slow service. One coffee for the experience is enough.'],
  ],
  sagradaFamilia: [
    [
      'demo',
      5,
      '2026-04',
      'Book the first slot of the day: the morning light through the windows is unforgettable.',
    ],
    [
      'ana',
      5,
      '2025-10',
      'Por dentro parece uma floresta de pedra. Vale pagar a subida às torres.',
    ],
    [
      'bruno',
      4,
      '2026-02',
      'Impressionante, mas a obra ao redor tira um pouco do encanto. Reserve com antecedência.',
    ],
    [
      'carla',
      5,
      '2026-06',
      'Fiquei uma hora só olhando os vitrais. O audioguia explica muito bem.',
    ],
    [
      'diego',
      4,
      '2025-09',
      'Hay que reservar con días de anticipación. Por dentro supera cualquier foto.',
    ],
    [
      'elena',
      5,
      '2026-05',
      'Worth every euro. Skip the towers if narrow spiral stairs bother you.',
    ],
  ],
  parcGuell: [
    [
      'demo',
      4,
      '2026-04',
      'The free part of the park is lovely; the monumental zone needs a timed ticket.',
    ],
    [
      'ana',
      4,
      '2025-10',
      'Subida puxada a partir do metrô. Vá cedo para ver a escadaria sem multidão.',
    ],
    [
      'bruno',
      5,
      '2026-02',
      'O banco de mosaico com a cidade lá embaixo é o melhor cartão-postal de Barcelona.',
    ],
    ['diego', 3, '2026-07', 'Bonito, pero con demasiada gente y poca sombra en verano.'],
    ['elena', 4, '2026-05', 'Take the bus up and walk down: the hill is steeper than it looks.'],
    [
      'nuria',
      5,
      '2026-03',
      'Vuelvo cada primavera. Entrar a primera hora cambia por completo la visita.',
    ],
  ],
  casaBatllo: [
    [
      'carla',
      4,
      '2026-06',
      'A fachada é linda; o tour com realidade aumentada é divertido, mas caro.',
    ],
    [
      'elena',
      5,
      '2026-05',
      'The rooftop at dusk was the highlight of our trip. Book the evening slot.',
    ],
    [
      'nuria',
      4,
      '2026-04',
      'Muy cuidada y bien explicada. La entrada es cara, pero el interior lo vale.',
    ],
  ],
  laBoqueria: [
    ['demo', 4, '2026-04', 'Go before 11:00; after that the aisles fill with tour groups.'],
    [
      'bruno',
      4,
      '2026-02',
      'Sucos baratos na entrada, mas os melhores balcões ficam no fundo do mercado.',
    ],
    [
      'diego',
      3,
      '2025-09',
      'Mucho ambiente, pero los puestos de la entrada son para turistas. Mejor ir al fondo.',
    ],
  ],
  platjaDeLaBarceloneta: [
    [
      'carla',
      3,
      '2026-06',
      'Lotada no verão e com muito vendedor. Mais ao norte a praia é mais tranquila.',
    ],
    [
      'elena',
      4,
      '2026-05',
      'Easy to reach on foot from the old town, and calm early in the morning.',
    ],
  ],
  museuPicasso: [
    [
      'ana',
      5,
      '2025-10',
      'Ótimo para entender como o estilo dele mudou desde a juventude. Reserve horário.',
    ],
    [
      'diego',
      4,
      '2025-09',
      'Los primeros años de Picasso, muy bien explicados. Reserva hora: las filas son largas.',
    ],
  ],
  bunkersDelCarmel: [
    [
      'nuria',
      5,
      '2026-04',
      'El mejor mirador de la ciudad, y gratis. Sube al atardecer y lleva abrigo.',
    ],
    [
      'elena',
      5,
      '2026-05',
      'A full circle of views over the city. Steep climb from the bus stop, bring water.',
    ],
    ['bruno', 4, '2026-02', 'Vista incrível, mas lota no pôr do sol. Leve lanche e paciência.'],
  ],
};

/** Reports on seeded reviews, so the moderation queue is not empty. */
export const SEED_REPORTS: Array<{
  number: number;
  review: { place: GazetteerName; author: SeedUserHandle };
  reporter: SeedUserHandle;
  reason: 'spam' | 'offensive' | 'misleading' | 'personal_data' | 'other';
  details: string | null;
  createdAt: string;
  resolution: { by: SeedUserHandle; at: string } | null;
}> = [
  {
    number: 1,
    review: { place: 'timeOutMarket', author: 'diego' },
    reporter: 'carla',
    reason: 'offensive',
    details: 'Tom agressivo com quem trabalha lá.',
    createdAt: '2026-07-02T10:00:00.000Z',
    resolution: null,
  },
  {
    number: 2,
    review: { place: 'timeOutMarket', author: 'diego' },
    reporter: 'elena',
    reason: 'misleading',
    details: null,
    createdAt: '2026-07-03T18:30:00.000Z',
    resolution: null,
  },
  {
    number: 3,
    review: { place: 'mercadoMunicipal', author: 'carla' },
    reporter: 'diego',
    reason: 'spam',
    details: null,
    createdAt: '2026-04-11T12:00:00.000Z',
    resolution: { by: 'ana', at: '2026-04-12T09:00:00.000Z' },
  },
];
