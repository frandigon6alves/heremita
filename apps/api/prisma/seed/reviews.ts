import type { GazetteerName } from './trips.js';
import type { SeedUserHandle } from './users.js';

/** [author, rating, visited month (YYYY-MM), body]. The language is the author's UI locale. */
type SeedReviewRow = [SeedUserHandle, 1 | 2 | 3 | 4 | 5, string, string];

// Written for the seed; not taken from any review site. Six places get a review
// from every demo user (enough for an average), most get one to five (count
// only), the rest none.
export const SEED_REVIEWS: Partial<Record<GazetteerName, SeedReviewRow[]>> = {
  torreDeBelem: [
    [
      'demo',
      5,
      '2025-06',
      'Chegue antes das 10h; depois disso a fila para subir dobra de tamanho.',
    ],
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
    ['diego', 5, '2025-11', 'Fui no fim da tarde, luz perfeita e quase ninguém no jardim.'],
    [
      'elena',
      4,
      '2026-05',
      'Smaller than expected, but the riverside walk from Belém makes it worth it.',
    ],
  ],
  casteloDeSaoJorge: [
    ['demo', 4, '2026-02', 'A subida é puxada; o elétrico 28 deixa perto. Leve água.'],
    ['ana', 5, '2025-10', 'Melhor vista de Lisboa. Os pavões andam soltos pelo pátio.'],
    [
      'bruno',
      4,
      '2026-04',
      'Comprei o bilhete online e entrei direto. As muralhas valem a volta inteira.',
    ],
    ['carla', 4, '2025-07', 'Muito sol ao meio-dia e pouca sombra. Melhor ir cedo.'],
    ['diego', 3, '2026-06', 'Bonito, mas caro para o que tem dentro. A vista é o principal.'],
    ['elena', 5, '2026-05', 'Go at opening time: you get the walls almost to yourself.'],
  ],
  pasteisDeBelem: [
    ['demo', 5, '2025-06', 'A fila do balcão anda rápido. Peça com canela e açúcar à parte.'],
    ['ana', 5, '2025-12', 'Lá dentro há salas enormes; quase sempre tem mesa livre.'],
    ['bruno', 4, '2026-04', 'Ótimo, mas não achei tão diferente das outras pastelarias do bairro.'],
    ['carla', 5, '2026-02', 'Saem quentes do forno o dia todo. Levei uma caixa de seis.'],
    ['diego', 4, '2025-08', 'Preço justo, atendimento corrido. Comi no jardim em frente.'],
    ['elena', 5, '2026-05', 'Skip the takeaway queue and walk in: the tables turn over fast.'],
  ],
  cristoRedentor: [
    ['demo', 5, '2025-04', 'Peguei o primeiro trem do Cosme Velho e cheguei antes das excursões.'],
    ['ana', 4, '2025-12', 'Vista inesquecível, mas a plataforma lota muito depois das 10h.'],
    ['bruno', 3, '2026-01', 'Fui num dia nublado e não vi nada. Confira a câmera ao vivo antes.'],
    ['carla', 5, '2026-02', 'Valeu cada minuto de fila. Leve casaco, venta bastante lá em cima.'],
    ['diego', 4, '2025-10', 'Van oficial saindo de Copacabana foi mais prático que o trem.'],
    ['elena', 5, '2026-03', 'Clear morning, short queue on the first train. Stunning.'],
  ],
  masp: [
    [
      'demo',
      5,
      '2026-01',
      'Os cavaletes de vidro fazem o acervo parecer outra coisa. Terça é grátis.',
    ],
    ['ana', 5, '2025-11', 'Acervo incrível e bem montado. Reserve duas horas no mínimo.'],
    ['bruno', 4, '2026-03', 'Exposição temporária fraca, mas o acervo permanente compensa.'],
    [
      'carla',
      4,
      '2025-08',
      'O vão livre aos domingos tem feira de antiguidades. Combine as duas coisas.',
    ],
    ['diego', 3, '2026-06', 'Fila longa na terça gratuita. Pagar e ir em outro dia vale a pena.'],
    ['elena', 5, '2026-04', 'The glass easels are unlike any museum I know. Free on Tuesdays.'],
  ],
  tourEiffel: [
    ['demo', 4, '2025-09', 'Subi pelas escadas até o segundo andar: mais barato e sem fila.'],
    ['ana', 3, '2026-02', 'Linda, mas muito cheia. A vista do Trocadéro é melhor para fotos.'],
    [
      'bruno',
      4,
      '2025-10',
      'Reserve o horário do topo com antecedência; esgotou para o mesmo dia.',
    ],
    ['carla', 5, '2026-07', 'À noite, quando pisca na hora cheia, é emocionante.'],
    ['diego', 2, '2026-05', 'Controle de segurança demorado e muita gente vendendo souvenir.'],
    ['elena', 4, '2026-09', 'Take the stairs to the second floor, then the lift. Half the queue.'],
  ],
  mosteiroDosJeronimos: [
    ['ana', 5, '2025-10', 'O claustro é a parte mais bonita. A igreja tem entrada gratuita.'],
    ['carla', 4, '2026-02', 'Fila grande; o bilhete combinado com a Torre de Belém ajuda.'],
    ['diego', 4, '2026-06', 'Arquitetura impressionante. Domingo de manhã estava tranquilo.'],
    ['elena', 5, '2026-05', 'The cloister alone is worth the ticket. Go right at opening.'],
  ],
  miradouroDeSantaLuzia: [
    ['demo', 5, '2026-02', 'Azulejos lindos e vista para o rio. Ótimo para o fim da tarde.'],
    ['bruno', 4, '2026-04', 'Cheio de turistas, mas a vista compensa. Tem músico quase sempre.'],
    ['elena', 4, '2026-05', 'Small terrace, great tiles, packed at sunset.'],
  ],
  timeOutMarket: [
    ['carla', 4, '2026-02', 'Muitas opções num lugar só. Difícil achar mesa no almoço.'],
    ['diego', 2, '2026-06', 'Lugar de turista, comida cara e barulho demais. Não recomendo.'],
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
    ['diego', 4, '2025-08', 'Bom para almoçar e passear. Fica longe do centro, vá de elétrico.'],
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
    ['diego', 4, '2025-08', 'Bar curioso num antigo hotel. Boa música e drinks bem feitos.'],
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
    ['diego', 4, '2025-10', 'Ingresso caro, mas a experiência vale. Fila pequena às 8h.'],
    ['elena', 5, '2026-03', 'Sunset from the top was the best moment of the whole trip.'],
  ],
  escadariaSelaron: [
    ['carla', 4, '2026-02', 'Muito colorida, ótima para fotos cedo, antes da multidão.'],
    ['diego', 3, '2025-10', 'Bonita, mas lotada. Fique atento aos pertences.'],
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
    ['diego', 5, '2025-10', 'Interativo e bem pensado. Terça a entrada é gratuita.'],
  ],
  arcosDaLapa: [['bruno', 4, '2026-01', 'Bonito à noite, mas vá em grupo e de táxi na volta.']],
  mercadoMunicipal: [
    ['carla', 4, '2025-08', 'O sanduíche de mortadela é enorme: divida com alguém.'],
    ['diego', 5, '2026-03', 'Vitrais lindos e frutas para provar. Vá com fome.'],
    ['elena', 3, '2026-04', 'Fun to walk around, but the fruit sellers push hard.'],
  ],
  parqueIbirapuera: [
    ['ana', 5, '2025-11', 'Alugue bicicleta e passe pelo Museu Afro e pela Oca.'],
    ['diego', 4, '2026-03', 'Domingo fica cheio, mas é o melhor programa gratuito da cidade.'],
  ],
  pinacoteca: [
    ['ana', 5, '2025-11', 'Prédio lindo e acervo brasileiro excelente. Sábado é grátis.'],
    ['diego', 4, '2026-03', 'Combine com a Estação da Luz, fica do lado.'],
  ],
  becoDoBatman: [
    ['carla', 4, '2025-08', 'Grafites renovados com frequência. Vá de manhã, à tarde lota.'],
  ],
  barBrahma: [
    ['diego', 4, '2026-03', 'Chope gelado e samba ao vivo na esquina mais famosa da cidade.'],
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
