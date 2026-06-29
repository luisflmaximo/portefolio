(function () {
  'use strict';

  try {
    sessionStorage.setItem('secretUnlocked', '1');
  } catch (_) {}

  const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
  const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
  const FFMPEG_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js';
  const FFMPEG_CORE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js';
  const MEGABYTE = 1024 * 1024;

  const state = {
    activeTool: null,
    activeGroup: null,
    files: [],
    results: [],
    processing: false,
    uploadMode: 'files',
    ffmpegPromise: null,
    ffmpegInstance: null,
    ffmpegFetchFile: null,
    pdfJsPromise: null,
    visualEditor: {
      pdfDoc: null,
      pageIndex: 1,
      scale: 1,
      pdfPage: null,
      elements: [],
      activeElement: null
    },
    imageWatermark: {
      image: null,
      scale: 1,
      elements: [],
      activeElement: null
    },
    bgRemove: {
      image: null,
      maskCanvas: null,
      maskCtx: null,
      baseCanvas: null,
      baseCtx: null,
      baseNeedsUpdate: true,
      hasEdits: false,
      brushMode: 'select-color',
      isDrawing: false,
      lastX: undefined,
      lastY: undefined
    }
  };

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function stem(filename) {
    const idx = filename.lastIndexOf('.');
    return idx === -1 ? filename : filename.slice(0, idx);
  }

  function formatBytes(bytes, decimals) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : (decimals || 2);
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds === Infinity || seconds < 0) return '—';
    if (seconds < 60) return Math.round(seconds) + 's';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return mins + 'm ' + secs + 's';
  }

  function optionalNumber(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    if (!text) return null;
    const num = Number(text);
    return isNaN(num) ? null : num;
  }

  function toNumber(value, fallback) {
    const num = Number(value);
    return isNaN(num) ? fallback : num;
  }

  function sanitizeFsName(name) {
    return String(name || '')
      .replace(/[^a-zA-Z0-9_\.-]/g, '_');
  }

  function extForFormat(mime) {
    if (mime === 'image/webp') return 'webp';
    if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
    if (mime === 'image/png') return 'png';
    return 'webp';
  }

  function mimeForVideoFormat(format) {
    if (format === 'mp4') return 'video/mp4';
    if (format === 'webm') return 'video/webm';
    if (format === 'mkv') return 'video/x-matroska';
    if (format === 'mov') return 'video/quicktime';
    if (format === 'avi') return 'video/x-msvideo';
    return 'video/mp4';
  }

  function mimeForAudioFormat(format) {
    if (format === 'mp3') return 'audio/mpeg';
    if (format === 'wav') return 'audio/wav';
    if (format === 'ogg') return 'audio/ogg';
    if (format === 'opus') return 'audio/opus';
    return 'audio/mpeg';
  }

  function isDirectMediaUrl(url) {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname.toLowerCase();
      const mediaExtensions = [
        '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp', '.ico',
        '.mp4', '.m4v', '.webm', '.ogv', '.mov', '.mkv', '.avi',
        '.mp3', '.wav', '.ogg', '.opus', '.m4a', '.flac', '.aac'
      ];
      return mediaExtensions.some(function (ext) {
        return pathname.endsWith(ext);
      });
    } catch (_) {
      return false;
    }
  }

  function getFilenameFromUrl(url) {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname;
      const parts = pathname.split('/');
      const lastPart = parts[parts.length - 1];
      if (lastPart && lastPart.includes('.')) {
        return decodeURIComponent(lastPart);
      }
    } catch (_) {}
    return 'media-download';
  }

  const DEFAULT_FALLBACK_APIS = [
    'https://api.cobalt.tools/',
    'https://cobalt.api.ryz.cx/',
    'https://api.cobalt.best/',
    'https://cobalt-api.l1bre.net/',
    'https://cobalt.k0.tf/api/'
  ];

  let dynamicFallbackApis = [];

  async function loadDynamicCobaltInstances() {
    try {
      const response = await fetch('https://instances.cobalt.best/api/instances');
      if (response.ok) {
        const list = await response.json();
        if (Array.isArray(list)) {
          const urls = list
            .filter(function (item) {
              return item && item.url && item.cors;
            })
            .map(function (item) {
              let url = item.url.trim();
              return url.endsWith('/') ? url : url + '/';
            });
          if (urls.length > 0) {
            dynamicFallbackApis = urls;
          }
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar instâncias dinâmicas do Cobalt:', err);
    }
  }

  const tools = [
    {
      id: 'pdf-insert',
      group: 'PDF',
      title: 'Editar PDF',
      desc: 'Sobrepõe texto formatado e imagens em cima de páginas de um PDF existente.',
      inputMode: 'files',
      accept: '.pdf,application/pdf',
      actionLabel: 'Gravar Alterações',
      waitHint: 'Adiciona texto ou imagens e arrasta-os para a posição pretendida.',
      badges: ['PDF', 'Inserir', 'Offline'],
      options: [],
      kind: 'pdf-heavy',
      processor: processPdfInsertVisual,
    },
    {
      id: 'pdf-rasterize',
      group: 'PDF',
      title: 'PDF para imagem-only',
      desc: 'Renderiza cada página como imagem e cria um novo PDF sem texto copiável.',
      inputMode: 'files',
      accept: '.pdf,application/pdf',
      actionLabel: 'Rasterizar PDF',
      waitHint: 'Pode demorar mais em PDFs com muitas páginas porque cada página é desenhada como imagem.',
      badges: ['PDF', 'Lote', 'Offline'],
      options: [
        {
          id: 'pdfScale',
          label: 'Qualidade',
          type: 'select',
          value: '1.65',
          choices: [
            ['1.25', 'Leve'],
            ['1.65', 'Equilibrada'],
            ['2.1', 'Alta'],
          ],
        },
      ],
      kind: 'pdf-heavy',
      processor: processPdfRasterize,
    },
    {
      id: 'pdf-watermark',
      group: 'PDF',
      title: 'Marca de água em PDF',
      desc: 'Aplica texto em diagonal em cada página do PDF.',
      inputMode: 'files',
      accept: '.pdf,application/pdf',
      actionLabel: 'Aplicar marca',
      waitHint: 'O ficheiro é regravado localmente, sem enviar nada para fora do browser.',
      badges: ['PDF', 'Lote', 'Offline'],
      options: [
        { id: 'watermarkText', label: 'Texto', type: 'text', value: 'CONFIDENCIAL' },
        { id: 'watermarkOpacity', label: 'Opacidade', type: 'range', min: '0.05', max: '0.45', step: '0.05', value: '0.18' },
        {
          id: 'watermarkAngle',
          label: 'Ângulo',
          type: 'select',
          value: '35',
          choices: [
            ['25', '25°'],
            ['35', '35°'],
            ['45', '45°'],
          ],
        },
      ],
      kind: 'pdf-lite',
      processor: processPdfWatermark,
    },
    {
      id: 'pdf-sign',
      group: 'PDF',
      title: 'Assinar PDF',
      desc: 'Adiciona uma assinatura textual no rodapé da página escolhida.',
      inputMode: 'files',
      accept: '.pdf,application/pdf',
      actionLabel: 'Assinar PDF',
      waitHint: 'A assinatura é adicionada localmente ao PDF carregado.',
      badges: ['PDF', 'Lote', 'Offline'],
      options: [
        { id: 'signatureText', label: 'Assinatura', type: 'text', value: 'Luis Maximo' },
        {
          id: 'signaturePage',
          label: 'Página',
          type: 'select',
          value: 'last',
          choices: [
            ['last', 'Última'],
            ['first', 'Primeira'],
            ['all', 'Todas'],
          ],
        },
      ],
      kind: 'pdf-lite',
      processor: processPdfSign,
    },
    {
      id: 'pdf-merge',
      group: 'PDF',
      title: 'Juntar PDFs',
      desc: 'Combina vários PDFs numa ordem única.',
      inputMode: 'files',
      accept: '.pdf,application/pdf',
      actionLabel: 'Juntar PDFs',
      waitHint: 'Útil para consolidar vários documentos numa única saída.',
      badges: ['PDF', 'Lote', 'Offline'],
      options: [],
      kind: 'pdf-lite',
      processor: processPdfMerge,
    },
    {
      id: 'pdf-to-image',
      group: 'PDF',
      title: 'PDF para Imagem',
      desc: 'Converte e extrai cada página do PDF como um ficheiro de imagem separado.',
      inputMode: 'files',
      accept: '.pdf,application/pdf',
      actionLabel: 'Converter para Imagem',
      waitHint: 'Cada página será guardada no formato de imagem selecionado.',
      badges: ['PDF', 'Imagens', 'Offline'],
      options: [
        {
          id: 'pdfToImageFormat',
          label: 'Formato da Imagem',
          type: 'select',
          value: 'image/png',
          choices: [
            ['image/png', 'PNG'],
            ['image/jpeg', 'JPEG'],
            ['image/webp', 'WEBP'],
          ],
        },
        {
          id: 'pdfToImageScale',
          label: 'Qualidade/Escala',
          type: 'select',
          value: '1.65',
          choices: [
            ['1.25', 'Leve'],
            ['1.65', 'Equilibrada'],
            ['2.1', 'Alta'],
          ],
        },
      ],
      kind: 'pdf-heavy',
      processor: processPdfToImage,
    },
    {
      id: 'image-to-pdf',
      group: 'PDF',
      title: 'Imagens para PDF',
      desc: 'Converte um lote de imagens num único ficheiro PDF (uma imagem por página).',
      inputMode: 'files',
      accept: 'image/*',
      actionLabel: 'Gerar PDF',
      waitHint: 'As imagens serão convertidas localmente e juntas num PDF.',
      badges: ['PDF', 'Imagens', 'Offline'],
      options: [
        {
          id: 'imageToPdfMargin',
          label: 'Margem da Página (px)',
          type: 'select',
          value: '0',
          choices: [
            ['0', 'Sem Margem (Imagem inteira)'],
            ['20', 'Pequena (20px)'],
            ['40', 'Grande (40px)'],
          ],
        },
      ],
      kind: 'pdf-heavy',
      processor: processImageToPdf,
    },
    {
      id: 'image-resize',
      group: 'Imagem',
      title: 'Redimensionar Imagem',
      desc: 'Redimensiona imagens em lote mantendo ou alterando proporções.',
      inputMode: 'files',
      accept: 'image/*',
      actionLabel: 'Redimensionar',
      waitHint: 'As imagens são redimensionadas localmente no browser.',
      badges: ['Imagem', 'Lote', 'Offline'],
      options: [
        { id: 'resizeWidth', label: 'Largura (px)', type: 'number', value: '1280' },
        { id: 'resizeHeight', label: 'Altura (px, opcional)', type: 'number', value: '' },
        {
          id: 'resizeFormat',
          label: 'Formato',
          type: 'select',
          value: 'image/webp',
          choices: [
            ['image/webp', 'WEBP'],
            ['image/jpeg', 'JPEG'],
            ['image/png', 'PNG'],
          ],
        },
        { id: 'imageQuality', label: 'Qualidade', type: 'range', min: '0.1', max: '1.0', step: '0.05', value: '0.9' },
      ],
      kind: 'image',
      processor: processImageBatch,
    },
    {
      id: 'image-crop',
      group: 'Imagem',
      title: 'Recortar Imagem',
      desc: 'Recorta imagens automaticamente para uma proporção padrão.',
      inputMode: 'files',
      accept: 'image/*',
      actionLabel: 'Recortar',
      waitHint: 'Corta centrado para a proporção selecionada.',
      badges: ['Imagem', 'Lote', 'Offline'],
      options: [
        {
          id: 'cropRatio',
          label: 'Proporção',
          type: 'select',
          value: '1:1',
          choices: [
            ['1:1', 'Quadrado (1:1)'],
            ['16:9', 'Panorâmico (16:9)'],
            ['4:3', 'Foto (4:3)'],
            ['9:16', 'Vertical (9:16)'],
          ],
        },
        {
          id: 'cropFormat',
          label: 'Formato',
          type: 'select',
          value: 'image/webp',
          choices: [
            ['image/webp', 'WEBP'],
            ['image/jpeg', 'JPEG'],
            ['image/png', 'PNG'],
          ],
        },
        { id: 'imageQuality', label: 'Qualidade', type: 'range', min: '0.1', max: '1.0', step: '0.05', value: '0.9' },
      ],
      kind: 'image',
      processor: processImageBatch,
    },
    {
      id: 'image-watermark',
      group: 'Imagem',
      title: 'Marca de Água em Imagem',
      desc: 'Desenha marcas de água (texto ou logótipos/imagem) de forma visual e interativa.',
      inputMode: 'files',
      accept: 'image/*',
      actionLabel: 'Aplicar Marca',
      waitHint: 'Desenha a marca por cima da primeira imagem para aplicar a todas.',
      badges: ['Imagem', 'Lote', 'Offline'],
      options: [
        {
          id: 'imageWatermarkOutFormat',
          label: 'Formato de Saída',
          type: 'select',
          value: 'image/webp',
          choices: [
            ['image/webp', 'WEBP'],
            ['image/jpeg', 'JPEG'],
            ['image/png', 'PNG'],
          ],
        },
        { id: 'imageWatermarkOutQuality', label: 'Qualidade (WEBP/JPEG)', type: 'range', min: '0.1', max: '1.0', step: '0.05', value: '0.9' },
      ],
      kind: 'image',
      processor: processImageWatermarkVisual,
    },
    {
      id: 'image-bg-remove',
      group: 'Imagem',
      title: 'Remover Fundo (Croma/Sólido)',
      desc: 'Remove o fundo com deteção inteligente de contornos, flood-fill e suavização de arestas.',
      inputMode: 'files',
      accept: 'image/*',
      actionLabel: 'Remover Fundo',
      waitHint: 'Processamento avançado feito localmente no canvas do browser.',
      badges: ['Imagem', 'Lote', 'Offline'],
      options: [
        {
          id: 'bgMode',
          label: 'Fundo a remover',
          type: 'select',
          value: 'flood',
          choices: [
            ['flood', 'Inteligente (Flood-Fill das Margens)'],
            ['auto', 'Simples (Cor Média das Margens)'],
            ['color', 'Cor Personalizada (Croma / Pipeta)'],
            ['white', 'Fundo Branco (Produto)'],
            ['black', 'Fundo Preto'],
          ],
        },
        { id: 'bgColor', label: 'Cor Personalizada', type: 'color', value: '#ffffff' },
        { id: 'bgThreshold', label: 'Sensibilidade (Tolerância)', type: 'range', min: '5', max: '150', step: '5', value: '32' },
        { id: 'bgSoftness', label: 'Suavidade (Arestas)', type: 'range', min: '0', max: '100', step: '5', value: '15' },
        { id: 'bgEdgeRefine', label: 'Refinamento de Contorno', type: 'range', min: '0', max: '100', step: '5', value: '40' },
        { id: 'bgDenoise', label: 'Limpeza de Ruído', type: 'range', min: '0', max: '5', step: '1', value: '1' },
      ],
      kind: 'image',
      processor: processImageBatch,
    },
    {
      id: 'image-convert',
      group: 'Imagem',
      title: 'Converter Imagem',
      desc: 'Converte imagens em lote para outro formato (ex.: PNG para WEBP).',
      inputMode: 'files',
      accept: 'image/*',
      actionLabel: 'Converter',
      waitHint: 'Útil para otimizar imagens para a web.',
      badges: ['Imagem', 'Lote', 'Offline'],
      options: [
        {
          id: 'imageFormat',
          label: 'Formato de Saída',
          type: 'select',
          value: 'image/webp',
          choices: [
            ['image/webp', 'WEBP'],
            ['image/jpeg', 'JPEG'],
            ['image/png', 'PNG'],
          ],
        },
        { id: 'imageQuality', label: 'Qualidade', type: 'range', min: '0.1', max: '1.0', step: '0.05', value: '0.9' },
      ],
      kind: 'image',
      processor: processImageBatch,
    },
    {
      id: 'video-convert',
      group: 'Vídeo',
      title: 'Converter Vídeo',
      desc: 'Converte formatos de vídeo localmente.',
      inputMode: 'files',
      accept: 'video/*',
      actionLabel: 'Converter Vídeo',
      waitHint: 'A primeira execução irá descarregar o módulo do FFmpeg (cerca de 25MB).',
      badges: ['Vídeo', 'FFmpeg', 'Offline'],
      options: [
        {
          id: 'videoFormat',
          label: 'Formato',
          type: 'select',
          value: 'mp4',
          choices: [
            ['mp4', 'MP4 (H.264/AAC)'],
            ['webm', 'WebM (VP9/Opus)'],
            ['mkv', 'MKV'],
            ['mov', 'MOV'],
            ['avi', 'AVI'],
          ],
        },
        {
          id: 'videoCrf',
          label: 'Fator Qualidade (CRF - menor é melhor)',
          type: 'select',
          value: '22',
          choices: [
            ['18', 'Alta (18)'],
            ['22', 'Equilibrada (22)'],
            ['26', 'Baixa (26)'],
          ],
        },
        {
          id: 'audioBitrate',
          label: 'Bitrate de Áudio',
          type: 'select',
          value: '192',
          choices: [
            ['96', '96 kbps'],
            ['128', '128 kbps'],
            ['192', '192 kbps'],
            ['256', '256 kbps'],
          ],
        },
        { id: 'videoWidth', label: 'Largura (opcional)', type: 'number', value: '' },
        { id: 'videoHeight', label: 'Altura (opcional)', type: 'number', value: '' },
        { id: 'videoFps', label: 'FPS (opcional)', type: 'number', value: '' },
      ],
      kind: 'ffmpeg',
      processor: processVideoConvert,
    },
    {
      id: 'video-to-mp3',
      group: 'Vídeo',
      title: 'Extrair MP3 de Vídeo',
      desc: 'Extrai a faixa de áudio de um vídeo e guarda como MP3.',
      inputMode: 'files',
      accept: 'video/*',
      actionLabel: 'Extrair Áudio',
      waitHint: 'O processamento usa FFmpeg.wasm localmente.',
      badges: ['Áudio', 'FFmpeg', 'Offline'],
      options: [
        {
          id: 'videoMp3Bitrate',
          label: 'Bitrate de Áudio',
          type: 'select',
          value: '192',
          choices: [
            ['96', '96 kbps'],
            ['128', '128 kbps'],
            ['192', '192 kbps'],
            ['256', '256 kbps'],
            ['320', '320 kbps'],
          ],
        },
      ],
      kind: 'ffmpeg',
      processor: processVideoToMp3,
    },
    {
      id: 'audio-convert',
      group: 'Áudio',
      title: 'Converter Áudio',
      desc: 'Converte ficheiros de áudio localmente para outros formatos.',
      inputMode: 'files',
      accept: 'audio/*',
      actionLabel: 'Converter Áudio',
      waitHint: 'O processamento usa FFmpeg.wasm localmente.',
      badges: ['Áudio', 'FFmpeg', 'Offline'],
      options: [
        {
          id: 'audioFormat',
          label: 'Formato de Saída',
          type: 'select',
          value: 'mp3',
          choices: [
            ['mp3', 'MP3'],
            ['wav', 'WAV'],
            ['ogg', 'OGG (Vorbis)'],
            ['opus', 'Opus'],
          ],
        },
        {
          id: 'audioConvertBitrate',
          label: 'Bitrate de Áudio',
          type: 'select',
          value: '192',
          choices: [
            ['96', '96 kbps'],
            ['128', '128 kbps'],
            ['192', '192 kbps'],
            ['256', '256 kbps'],
            ['320', '320 kbps'],
          ],
        },
      ],
      kind: 'ffmpeg',
      processor: processAudioConvert,
    },
    {
      id: 'gif-edit',
      group: 'GIF',
      title: 'Editar/Converter GIF',
      desc: 'Altera dimensões, FPS ou converte GIFs para MP4/WebP.',
      inputMode: 'files',
      accept: 'image/gif',
      actionLabel: 'Processar GIF',
      waitHint: 'O processamento usa FFmpeg.wasm localmente.',
      badges: ['GIF', 'FFmpeg', 'Offline'],
      options: [
        {
          id: 'gifFormat',
          label: 'Formato de Saída',
          type: 'select',
          value: 'gif',
          choices: [
            ['gif', 'GIF Animado'],
            ['webp', 'WebP Animado'],
            ['mp4', 'Vídeo MP4 (Silencioso)'],
          ],
        },
        { id: 'gifWidth', label: 'Largura (opcional)', type: 'number', value: '' },
        { id: 'gifHeight', label: 'Altura (opcional)', type: 'number', value: '' },
        { id: 'gifFps', label: 'FPS', type: 'number', value: '15' },
        { id: 'gifStart', label: 'Segundo de Início (opcional)', type: 'number', value: '' },
        { id: 'gifDuration', label: 'Duração em segundos (opcional)', type: 'number', value: '' },
      ],
      kind: 'ffmpeg',
      processor: processGifEdit,
    },
    {
      id: 'link-download',
      group: 'Links',
      title: 'Descarregar de Link (Vídeo/Áudio/Imagem)',
      desc: 'Gera ligações de download direto para vídeos, áudios ou imagens de serviços compatíveis (ex.: Cobalt).',
      inputMode: 'urls',
      accept: '',
      actionLabel: 'Gerar Links',
      waitHint: 'Insira ligações externas (vídeo, áudio ou imagem), uma por linha.',
      badges: ['Link', 'Download', 'Online'],
      options: [
        {
          id: 'linkMode',
          label: 'Modo',
          type: 'select',
          value: 'auto',
          choices: [
            ['auto', 'Automático (Melhor disponível)'],
            ['video', 'Apenas Vídeo'],
            ['audio', 'Apenas Áudio'],
          ],
        },
        {
          id: 'linkQuality',
          label: 'Qualidade Máxima de Vídeo',
          type: 'select',
          value: '720',
          choices: [
            ['360', '360p'],
            ['480', '480p'],
            ['720', '720p'],
            ['1080', '1080p'],
            ['1440', '1440p (2K)'],
            ['2160', '2160p (4K)'],
          ],
        },
        {
          id: 'linkAudioFormat',
          label: 'Formato de Áudio',
          type: 'select',
          value: 'mp3',
          choices: [
            ['mp3', 'MP3'],
            ['ogg', 'OGG'],
            ['wav', 'WAV'],
            ['opus', 'Opus'],
          ],
        },
        {
          id: 'linkAudioBitrate',
          label: 'Bitrate de Áudio',
          type: 'select',
          value: '192',
          choices: [
            ['128', '128 kbps'],
            ['192', '192 kbps'],
            ['256', '256 kbps'],
            ['320', '320 kbps'],
          ],
        },
      ],
      kind: 'link',
      processor: processLinkHelper,
    },
    {
      id: 'pdf-compress',
      group: 'PDF',
      title: 'Comprimir PDF',
      desc: 'Reduz o tamanho de ficheiros PDF re-comprimindo as suas imagens.',
      inputMode: 'files',
      accept: '.pdf,application/pdf',
      actionLabel: 'Comprimir PDF',
      waitHint: 'As imagens serão re-amostradas e comprimidas localmente no browser.',
      badges: ['PDF', 'Compressão', 'Offline'],
      options: [
        {
          id: 'pdfCompressQuality',
          label: 'Qualidade/Nível de Compressão',
          type: 'select',
          value: 'medium',
          choices: [
            ['low', 'Alta Compressão (Menor qualidade de imagem)'],
            ['medium', 'Otimizado (Equilibrado)'],
            ['high', 'Qualidade Superior (Menor compressão)'],
          ],
        },
      ],
      kind: 'pdf-heavy',
      processor: processPdfCompress,
    },
    {
      id: 'pdf-to-pptx',
      group: 'PDF',
      title: 'Exportar PDF para PPTX',
      desc: 'Converte páginas de PDF em diapositivos de PowerPoint (PPTX).',
      inputMode: 'files',
      accept: '.pdf,application/pdf',
      actionLabel: 'Exportar para PPTX',
      waitHint: 'Gera diapositivos com as imagens das páginas do PDF de forma local.',
      badges: ['PDF', 'PPTX', 'Offline'],
      options: [
        {
          id: 'pdfToPptxScale',
          label: 'Resolução da Imagem',
          type: 'select',
          value: '1.5',
          choices: [
            ['1.0', 'Leve (1.0x)'],
            ['1.5', 'Equilibrada (1.5x)'],
            ['2.0', 'Alta Qualidade (2.0x)'],
          ],
        },
      ],
      kind: 'pdf-heavy',
      processor: processPdfToPptx,
    },
    {
      id: 'pdf-to-word',
      group: 'PDF',
      title: 'Exportar PDF para Word',
      desc: 'Extrai o texto das páginas do PDF e exporta para um documento Word (DOCX).',
      inputMode: 'files',
      accept: '.pdf,application/pdf',
      actionLabel: 'Exportar para Word',
      waitHint: 'Processado 100% no browser, ideal para PDFs com texto editável.',
      badges: ['PDF', 'Word', 'Offline'],
      options: [],
      kind: 'pdf-heavy',
      processor: processPdfToWord,
    },
    {
      id: 'image-compress',
      group: 'Imagem',
      title: 'Comprimir Imagem',
      desc: 'Reduz o tamanho de ficheiros de imagem (JPEG/WEBP) ajustando a qualidade.',
      inputMode: 'files',
      accept: 'image/*',
      actionLabel: 'Comprimir Imagem',
      waitHint: 'As imagens são otimizadas localmente.',
      badges: ['Imagem', 'Compressão', 'Offline'],
      options: [
        {
          id: 'imageCompressFormat',
          label: 'Formato de Saída',
          type: 'select',
          value: 'image/jpeg',
          choices: [
            ['image/jpeg', 'JPEG'],
            ['image/webp', 'WEBP'],
          ],
        },
        { id: 'imageCompressQuality', label: 'Qualidade (CRF)', type: 'range', min: '0.1', max: '1.0', step: '0.05', value: '0.70' },
      ],
      kind: 'image',
      processor: processImageBatch,
    },
    {
      id: 'image-enhance',
      group: 'Imagem',
      title: 'Melhorar Qualidade de Imagem',
      desc: 'Aplica nitidez digital (sharpen), contraste e brilho para melhorar a qualidade.',
      inputMode: 'files',
      accept: 'image/*',
      actionLabel: 'Melhorar Imagem',
      waitHint: 'Processamento de píxeis executado localmente.',
      badges: ['Imagem', 'Filtro', 'Offline'],
      options: [
        { id: 'enhanceSharpen', label: 'Foco/Nitidez', type: 'range', min: '0', max: '100', step: '5', value: '20' },
        { id: 'enhanceContrast', label: 'Contraste', type: 'range', min: '-50', max: '50', step: '5', value: '10' },
        { id: 'enhanceBrightness', label: 'Brilho', type: 'range', min: '-50', max: '50', step: '5', value: '0' },
      ],
      kind: 'image',
      processor: processImageBatch,
    },
    {
      id: 'image-to-svg',
      group: 'Imagem',
      title: 'Vetorizar Imagem para SVG',
      desc: 'Converte imagens de pixéis em gráficos vetoriais escaláveis (SVG).',
      inputMode: 'files',
      accept: 'image/*',
      actionLabel: 'Vetorizar para SVG',
      waitHint: 'O ImageTracer reconstrói as formas geométricas no browser.',
      badges: ['Imagem', 'Vetor', 'Offline'],
      options: [
        {
          id: 'svgColors',
          label: 'Número Máximo de Cores',
          type: 'select',
          value: '16',
          choices: [
            ['4', 'Muito Simples (4 cores)'],
            ['8', 'Simples (8 cores)'],
            ['16', 'Padrão (16 cores)'],
            ['32', 'Detalhado (32 cores)'],
            ['64', 'Foto (64 cores)'],
          ],
        },
      ],
      kind: 'image',
      processor: processImageToSvg,
    },
    {
      id: 'video-compress',
      group: 'Vídeo',
      title: 'Comprimir Vídeo',
      desc: 'Reduz o tamanho do vídeo ajustando resolução e bitrate.',
      inputMode: 'files',
      accept: 'video/*',
      actionLabel: 'Comprimir Vídeo',
      waitHint: 'Usa FFmpeg.wasm localmente para recomprimir o vídeo.',
      badges: ['Vídeo', 'FFmpeg', 'Offline'],
      options: [
        {
          id: 'videoCompressScale',
          label: 'Resolução de Vídeo',
          type: 'select',
          value: '75',
          choices: [
            ['50', 'Reduzir para metade (50% largura/altura)'],
            ['75', 'Reduzir 25% (75% largura/altura)'],
            ['100', 'Manter original'],
          ],
        },
        {
          id: 'videoCompressCrf',
          label: 'Fator de Compressão (CRF - maior comprime mais)',
          type: 'select',
          value: '28',
          choices: [
            ['24', 'Qualidade Boa (CRF 24)'],
            ['28', 'Qualidade Média (CRF 28)'],
            ['32', 'Super Leve (CRF 32)'],
          ],
        },
      ],
      kind: 'ffmpeg',
      processor: processVideoCompress,
    },
    {
      id: 'video-merge',
      group: 'Vídeo',
      title: 'Juntar Vídeos',
      desc: 'Combina vários videoclipes sequencialmente num único ficheiro.',
      inputMode: 'files',
      accept: 'video/*',
      actionLabel: 'Juntar Vídeos',
      waitHint: 'Faz a junção direta via FFmpeg.wasm localmente.',
      badges: ['Vídeo', 'FFmpeg', 'Offline'],
      options: [],
      kind: 'ffmpeg',
      processor: processVideoMerge,
    },
    {
      id: 'video-subtitle',
      group: 'Vídeo',
      title: 'Queimar Legendas no Vídeo',
      desc: 'Transcreve ou adiciona legendas formatadas com contraste garantido por cima do vídeo.',
      inputMode: 'files',
      accept: 'video/*',
      actionLabel: 'Adicionar Legendas',
      waitHint: 'Processado com FFmpeg.wasm. As legendas têm fundo preto de contraste e acentos legíveis.',
      badges: ['Vídeo', 'Legendas', 'Offline'],
      options: [
        {
          id: 'subtitleMode',
          label: 'Origem das Legendas',
          type: 'select',
          value: 'speech',
          choices: [
            ['speech', 'Transcrição Automática por IA (Whisper Local)'],
            ['srt', 'Carregar ficheiro SRT externo (.srt)'],
          ],
        },
        {
          id: 'subtitleModel',
          label: 'Modelo de Transcrição',
          type: 'select',
          value: 'Xenova/whisper-base',
          choices: [
            ['Xenova/whisper-base', 'Alta Precisão (Recomendado - 145MB)'],
            ['Xenova/whisper-tiny', 'Mais Rápido / Leve (75MB)'],
          ],
        },
        {
          id: 'subtitleFile',
          label: 'Ficheiro de Legendas (.srt)',
          type: 'file',
        },
        {
          id: 'subtitleLanguage',
          label: 'Idioma da Transcrição (se Automática)',
          type: 'select',
          value: 'pt-PT',
          choices: [
            ['pt-PT', 'Português (Portugal)'],
            ['pt-BR', 'Português (Brasil)'],
            ['en-US', 'Inglês (EUA)'],
          ],
        },
      ],
      kind: 'ffmpeg',
      processor: processVideoSubtitle,
    },
    {
      id: 'link-shorten-qr',
      group: 'Links',
      title: 'Encurtar Links e QR Code',
      desc: 'Encurta qualquer ligação de forma simples e gera o respetivo QR Code personalizável.',
      inputMode: 'urls',
      accept: '',
      actionLabel: 'Encurtar e Gerar QR',
      waitHint: 'Cole as ligações. Pode opcionalmente carregar um logótipo central para o QR Code.',
      badges: ['Links', 'QR Code', 'Online'],
      options: [
        {
          id: 'qrSize',
          label: 'Tamanho do QR Code',
          type: 'select',
          value: '256',
          choices: [
            ['128', 'Pequeno (128x128)'],
            ['256', 'Médio (256x256)'],
            ['512', 'Grande (512x512)'],
          ],
        },
        { id: 'qrColor', label: 'Cor Principal do QR Code', type: 'color', value: '#000000' },
        { id: 'qrBgColor', label: 'Cor de Fundo do QR Code', type: 'color', value: '#ffffff' },
        {
          id: 'qrLogo',
          label: 'Logótipo Central (.png/.jpg, opcional)',
          type: 'file',
        },
      ],
      kind: 'link',
      processor: processLinkShortenQr,
    },
  ];

  const toolMap = tools.reduce(function (acc, tool) {
    acc[tool.id] = tool;
    return acc;
  }, Object.create(null));

  const refs = new Proxy({}, {
    get: function(target, prop) {
      return document.getElementById(prop);
    }
  });

  function matchesAccept(file, accept) {
    if (!accept) return true;
    const type = file.type || '';
    const name = file.name || '';
    return accept.split(',').some(function (value) {
      value = value.trim();
      if (!value) return false;
      if (value === 'image/*') return type.indexOf('image/') === 0;
      if (value.charAt(0) === '.') return name.endsWith(value);
      if (value.endsWith('/*')) {
        return type.indexOf(value.slice(0, -1)) === 0;
      }
      return type === value;
    });
  }

  function uniqueFileKey(file) {
    return [
      file.webkitRelativePath || file.name,
      file.size,
      file.lastModified,
    ].join('|');
  }

  function countInputBytes(files) {
    return files.reduce(function (total, file) {
      return total + (file.size || 0);
    }, 0);
  }

  function parseLinks() {
    const text = String(refs.linkInput.value || '');
    const seen = new Set();
    return text
      .split(/\r?\n/)
      .map(function (item) {
        return item.trim();
      })
      .filter(Boolean)
      .filter(function (item) {
        if (seen.has(item)) return false;
        seen.add(item);
        return true;
      });
  }

  function getOptions() {
    const options = {};
    state.activeTool.options.forEach(function (option) {
      const input = document.getElementById(option.id);
      if (!input) {
        options[option.id] = option.value;
        return;
      }

      if (option.type === 'checkbox') {
        options[option.id] = input.checked;
        return;
      }

      if (option.type === 'file') {
        options[option.id] = input.files && input.files.length > 0 ? input.files[0] : null;
        return;
      }

      options[option.id] = String(input.value || '');
    });
    return options;
  }

  function loadScriptOnce(src) {
    return new Promise(function (resolve, reject) {
      const existing = document.querySelector('script[data-src="' + src + '"]');
      if (existing && existing.dataset.loaded === 'true') {
        resolve();
        return;
      }

      if (existing) {
        existing.addEventListener('load', function () { resolve(); }, { once: true });
        existing.addEventListener('error', function () { reject(new Error('Não foi possível carregar ' + src)); }, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.src = src;
      script.onload = function () {
        script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = function () {
        reject(new Error('Não foi possível carregar ' + src));
      };
      document.head.appendChild(script);
    });
  }

  async function ensurePdfJs() {
    if (state.pdfJsPromise) return state.pdfJsPromise;

    state.pdfJsPromise = import(PDFJS_URL).then(function (module) {
      module.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      setRuntimeStatus('Módulo PDF carregado');
      return module;
    });

    return state.pdfJsPromise;
  }

  async function ensurePdfLib() {
    if (!window.PDFLib) {
      throw new Error('O módulo PDF ainda não carregou.');
    }
    return window.PDFLib;
  }

  async function ensureFfmpeg() {
    if (state.ffmpegPromise) return state.ffmpegPromise;

    state.ffmpegPromise = (async function () {
      await loadScriptOnce(FFMPEG_SCRIPT_URL);
      if (!window.FFmpeg || typeof window.FFmpeg.createFFmpeg !== 'function') {
        throw new Error('O conversor de vídeo não ficou disponível.');
      }
      try {
        const ffmpeg = window.FFmpeg.createFFmpeg({
          log: true,
          corePath: FFMPEG_CORE_URL,
          mainName: 'main',
        });
        await ffmpeg.load();
        state.ffmpegInstance = ffmpeg;
        state.ffmpegFetchFile = window.FFmpeg.fetchFile;
        setRuntimeStatus('Conversor de vídeo carregado');
        return ffmpeg;
      } catch (err) {
        state.ffmpegPromise = null;
        if (String(err).indexOf('SharedArrayBuffer') !== -1) {
          throw new Error('O browser bloqueou o FFmpeg. Tenta usar Chrome/Edge ou ativa as flags de cross-origin isolation.');
        }
        throw err;
      }
    }());

    return state.ffmpegPromise;
  }

  async function safeRunFfmpeg(ffmpeg, args) {
    try {
      await ffmpeg.run.apply(ffmpeg, args);
    } catch (err) {
      const msg = String(err && (err.message || err));
      if (msg.indexOf('exit(0)') !== -1 || (err && err.status === 0)) {
        return;
      }
      throw err;
    }
  }

  async function ensurePptxGen() {
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js');
    if (typeof window.PptxGenJS === 'undefined' && typeof PptxGenJS === 'undefined') {
      throw new Error('O módulo PPTXGenJS não carregou.');
    }
    return window.PptxGenJS || PptxGenJS;
  }

  async function ensureDocx() {
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.js');
    if (!window.docx) {
      throw new Error('O módulo docx não carregou.');
    }
    return window.docx;
  }

  async function ensureImageTracer() {
    await loadScriptOnce('https://cdn.jsdelivr.net/gh/jondobrera/ImageTracerJS@master/imagetracer_v1.2.6.js');
    if (typeof window.ImageTracer === 'undefined' && typeof ImageTracer === 'undefined') {
      throw new Error('O módulo ImageTracer não carregou.');
    }
    return window.ImageTracer || ImageTracer;
  }

  async function ensureQrCode() {
    await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js');
    if (typeof window.QRCode === 'undefined' && typeof QRCode === 'undefined') {
      throw new Error('O módulo QRCode não carregou.');
    }
    return window.QRCode || QRCode;
  }

  function setRuntimeStatus(text) {
    if (refs.runtimeStatus) refs.runtimeStatus.textContent = text;
  }

  function hasDownloadableResults() {
    return state.results.some(function (item) {
      return !!item.blob;
    });
  }

  function setProcessing(active) {
    state.processing = active;
    if (refs.busyOverlay) {
      refs.busyOverlay.hidden = true;
      refs.busyOverlay.style.display = 'none';
    }
    if (refs.runToolBtn) refs.runToolBtn.disabled = active;
    if (refs.downloadAllBtn) refs.downloadAllBtn.disabled = active || !hasDownloadableResults();
  }

  function setProgress(percent, title, detail) {
    const value = Math.max(0, Math.min(100, Number(percent || 0)));
    const width = value + '%';
    if (refs.progressBar) refs.progressBar.style.width = width;
    if (refs.overlayBar) refs.overlayBar.style.width = width;
    if (refs.progressPercent) refs.progressPercent.textContent = Math.round(value) + '%';
    const totalEst = getEstimatedSeconds();
    const remaining = Math.max(1, Math.round(totalEst * (1 - value / 100)));
    const remainingStr = 'Estimativa: ' + formatTime(remaining);
    if (refs.overlayEstimate) refs.overlayEstimate.textContent = remainingStr;
    if (refs.overlayCount) refs.overlayCount.textContent = getInputItems().length + ' itens';

    if (title && refs.progressStage) refs.progressStage.textContent = title;
    if (detail && refs.progressDetail) refs.progressDetail.textContent = detail;
    if (refs.overlayTitle && title) refs.overlayTitle.textContent = title;
    if (refs.overlayDetail && detail) refs.overlayDetail.textContent = detail;
    if (refs.progressEta) refs.progressEta.textContent = remainingStr;
  }

  function getInputItems() {
    if (!state.activeTool) return [];
    if (state.activeTool.inputMode === 'urls') {
      return parseLinks();
    }
    return state.files;
  }

  function getEstimatedSeconds() {
    if (!state.activeTool) return 0;
    const items = getInputItems();
    if (!items.length) return 0;

    if (state.activeTool.kind === 'link') {
      return Math.max(1, items.length * 0.18);
    }

    if (state.activeTool.kind === 'pdf-heavy') {
      return items.reduce(function (total, file) {
        return total + 1.8 + (file.size / MEGABYTE) * 0.85;
      }, 0);
    }

    if (state.activeTool.kind === 'pdf-lite') {
      return items.reduce(function (total, file) {
        return total + 0.35 + (file.size / MEGABYTE) * 0.08;
      }, 0);
    }

    if (state.activeTool.kind === 'image') {
      return items.reduce(function (total, file) {
        return total + 0.22 + (file.size / MEGABYTE) * 0.14;
      }, 0);
    }

    if (state.activeTool.kind === 'ffmpeg') {
      return items.reduce(function (total, file) {
        let est = 1.45 + (file.size / MEGABYTE) * 1.2;
        if (state.activeTool.id === 'video-subtitle') {
          const mode = getOptions().subtitleMode || 'speech';
          if (mode === 'speech') {
            const modelName = getOptions().subtitleModel || 'Xenova/whisper-base';
            if (modelName === 'Xenova/whisper-base') {
              est += 35.0 + (file.size / MEGABYTE) * 3.5;
            } else {
              est += 12.0 + (file.size / MEGABYTE) * 1.5;
            }
          }
        }
        return total + est;
      }, 0);
    }

    return items.length;
  }

  function updateCounters() {
    if (!state.activeTool) return;
    const items = getInputItems();
    const isFiles = state.activeTool.inputMode !== 'urls';
    const totalBytes = isFiles ? countInputBytes(items) : 0;
    const count = items.length;
    const queueText = isFiles
      ? (count === 0 ? 'Nenhum ficheiro carregado.' : (count === 1 ? '1 ficheiro pronto.' : count + ' ficheiros prontos.'))
      : (count === 0 ? 'Nenhuma ligação carregada.' : (count === 1 ? '1 ligação carregada.' : count + ' ligações carregadas.'));

    if (refs.inputCount) refs.inputCount.textContent = String(count);
    if (refs.inputSize) refs.inputSize.textContent = formatBytes(totalBytes);
    if (refs.estimateText) refs.estimateText.textContent = formatTime(getEstimatedSeconds());
    if (refs.queueCount) refs.queueCount.textContent = String(count);
    if (refs.queueSummary) {
      refs.queueSummary.innerHTML = [
        '<div class="summary-line">' + escapeHtml(queueText) + '</div>',
        '<div class="summary-line">' + escapeHtml(state.activeTool.waitHint) + '</div>',
      ].join('');
    }
    if (refs.overlayEstimate) refs.overlayEstimate.textContent = 'Estimativa: ' + formatTime(getEstimatedSeconds());
    if (refs.overlayCount) refs.overlayCount.textContent = count + ' item' + (count === 1 ? '' : 's');
    if (refs.toolCount) refs.toolCount.textContent = String(tools.length) + ' ferramentas';
  }

  function setHeroStatus() {
    if (refs.heroStatusTitle) refs.heroStatusTitle.textContent = state.activeTool.title;
    if (refs.heroStatusText) refs.heroStatusText.textContent = state.activeTool.waitHint;
    if (refs.heroPickFilesBtn) refs.heroPickFilesBtn.hidden = state.activeTool.inputMode === 'urls';
    if (refs.heroPickFolderBtn) refs.heroPickFolderBtn.hidden = state.activeTool.inputMode === 'urls';
  }

  function updateActiveChrome() {
    const tool = state.activeTool;
    if (!tool) return;
    if (refs.activeToolGroup) refs.activeToolGroup.textContent = tool.group;
    if (refs.activeToolTitle) refs.activeToolTitle.textContent = tool.title;
    if (refs.activeToolDesc) refs.activeToolDesc.textContent = tool.desc;
    if (refs.runToolBtn) refs.runToolBtn.textContent = tool.actionLabel;
    if (refs.linkHint) refs.linkHint.textContent = tool.waitHint;
    if (refs.dropZoneTitle) refs.dropZoneTitle.textContent = tool.inputMode === 'urls' ? 'Cole ligações aqui' : 'Arrasta ficheiros para aqui';
    if (refs.dropZoneText) {
      refs.dropZoneText.textContent = tool.inputMode === 'urls'
        ? 'Este modo trabalha com ligações, uma por linha.'
        : 'Aceita vários ficheiros e pastas. Também podes escolher manualmente.';
    }

    if (refs.fileInput) {
      refs.fileInput.accept = tool.inputMode === 'urls' ? '' : tool.accept;
    }
    if (refs.folderInput) {
      refs.folderInput.accept = tool.inputMode === 'urls' ? '' : tool.accept;
    }

    if (refs.linkPanel) refs.linkPanel.hidden = tool.inputMode !== 'urls';
    if (refs.dropZone) refs.dropZone.hidden = tool.inputMode === 'urls';
    if (refs.toolOptions) refs.toolOptions.hidden = tool.options.length === 0;

    const isPdfInsert = tool.id === 'pdf-insert';
    if (refs.pdfInsertPanel) refs.pdfInsertPanel.hidden = !isPdfInsert;

    const isImageWatermark = tool.id === 'image-watermark';
    if (refs.imageWatermarkPanel) refs.imageWatermarkPanel.hidden = !isImageWatermark;

    const isImageBgRemove = tool.id === 'image-bg-remove';
    if (refs.imageBgRemovePanel) refs.imageBgRemovePanel.hidden = !isImageBgRemove;
    if (isImageBgRemove && state.files.length > 0) {
      initImageBgRemoveEditor();
    }

    if (refs.toolPicker) {
      refs.toolPicker.value = tool.id;
    }

    setHeroStatus();
    if (refs.downloadAllBtn) refs.downloadAllBtn.disabled = !hasDownloadableResults();
  }

  function renderToolRail() {
    if (!refs.toolRail) return;

    const grouped = tools.reduce(function (acc, tool) {
      if (!acc[tool.group]) acc[tool.group] = [];
      acc[tool.group].push(tool);
      return acc;
    }, Object.create(null));

    refs.toolRail.innerHTML = Object.keys(grouped).map(function (group) {
      const items = grouped[group].map(function (tool) {
        const badges = tool.badges.slice(0, 3).map(function (badge) {
          return '<span class="tool-badge">' + escapeHtml(badge) + '</span>';
        }).join('');
        return [
          '<button type="button" class="tool-btn' + (tool.id === state.activeTool.id ? ' tool-btn--active' : '') + '" data-tool="' + escapeHtml(tool.id) + '">',
          '<span class="tool-btn__top"><strong class="tool-btn__title">' + escapeHtml(tool.title) + '</strong></span>',
          '<span class="tool-btn__desc">' + escapeHtml(tool.desc) + '</span>',
          '<span class="tool-btn__meta">' + badges + '</span>',
          '</button>',
        ].join('');
      }).join('');

      return [
        '<section class="tool-group">',
        '<p class="tool-group__title">' + escapeHtml(group) + '</p>',
        items,
        '</section>',
      ].join('');
    }).join('');
  }



  function renderToolPicker() {
    var menu = refs.toolTypeMenu;
    if (!menu) return;

    var groups = ['PDF', 'Imagem', 'Vídeo', 'Áudio', 'GIF', 'Links'];

    var groupIcons = {
      'PDF':    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>',
      'Imagem': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"/></svg>',
      'Vídeo':  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path stroke-linecap="round" stroke-linejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"/></svg>',
      'Áudio':  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path stroke-linecap="round" stroke-linejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z"/></svg>',
      'GIF':    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"/></svg>',
      'Links':  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"/></svg>'
    };

    menu.innerHTML = groups.map(function (group) {
      var isActiveGroup = group === state.activeGroup;
      var icon = groupIcons[group] || '';

      var groupTools = tools.filter(function (t) {
        return t.group === group;
      });

      var submenuHtml = [
        '<div class="tool-type-submenu">',
        groupTools.map(function (tool) {
          var isActive = state.activeTool && tool.id === state.activeTool.id;
          return [
            '<button type="button" class="tool-type-option' + (isActive ? ' tool-type-option--active' : '') + '" data-tool="' + escapeHtml(tool.id) + '">',
            '<strong>' + escapeHtml(tool.title) + '</strong>',
            '</button>'
          ].join('');
        }).join(''),
        '</div>'
      ].join('');

      return [
        '<div class="tool-type-item" data-type-group="' + escapeHtml(group) + '">',
        '<button type="button" class="tool-type-btn' + (isActiveGroup ? ' tool-type-btn--active' : '') + '" data-type-trigger="' + escapeHtml(group) + '">',
        icon,
        escapeHtml(group),
        '</button>',
        submenuHtml,
        '</div>'
      ].join('');
    }).join('');

    // Show currently selected tool label below the menu
    var existingLabel = menu.parentElement.querySelector('.tool-type-selected-label');
    if (existingLabel) existingLabel.remove();
    if (state.activeTool) {
      var labelDiv = document.createElement('div');
      labelDiv.className = 'tool-type-selected-label';
      labelDiv.innerHTML = [
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>',
        escapeHtml(state.activeTool.group + ' → ' + state.activeTool.title)
      ].join('');
      menu.parentElement.insertBefore(labelDiv, menu.nextSibling);
    }
  }



  function renderToolOptions() {
    refs.toolOptions.innerHTML = state.activeTool.options.map(function (option) {
      if (option.type === 'select') {
        return [
          '<div class="option-field">',
          '<label class="option-field__label" for="' + escapeHtml(option.id) + '">' + escapeHtml(option.label) + '</label>',
          '<select id="' + escapeHtml(option.id) + '" class="option-select">',
          option.choices.map(function (choice) {
            return '<option value="' + escapeHtml(choice[0]) + '"' + (choice[0] === option.value ? ' selected' : '') + '>' + escapeHtml(choice[1]) + '</option>';
          }).join(''),
          '</select>',
          '</div>',
        ].join('');
      }

      if (option.type === 'range') {
        return [
          '<div class="option-field">',
          '<label class="option-field__label" for="' + escapeHtml(option.id) + '">' + escapeHtml(option.label) + ' <span data-option-value="' + escapeHtml(option.id) + '">' + escapeHtml(option.value) + '</span></label>',
          '<input id="' + escapeHtml(option.id) + '" class="option-input" type="range" min="' + escapeHtml(option.min) + '" max="' + escapeHtml(option.max) + '" step="' + escapeHtml(option.step) + '" value="' + escapeHtml(option.value) + '">',
          '</div>',
        ].join('');
      }

      if (option.type === 'textarea') {
        return [
          '<div class="option-field">',
          '<label class="option-field__label" for="' + escapeHtml(option.id) + '">' + escapeHtml(option.label) + '</label>',
          '<textarea id="' + escapeHtml(option.id) + '" class="text-area" rows="' + escapeHtml(option.rows || 4) + '">' + escapeHtml(option.value || '') + '</textarea>',
          '</div>',
        ].join('');
      }

      return [
        '<div class="option-field">',
        '<label class="option-field__label" for="' + escapeHtml(option.id) + '">' + escapeHtml(option.label) + '</label>',
        '<input id="' + escapeHtml(option.id) + '" class="option-input" type="' + escapeHtml(option.type) + '" value="' + escapeHtml(option.value || '') + '">',
        '</div>',
      ].join('');
    }).join('');
  }

  function renderInputs() {
    const items = getInputItems();
    if (!refs.inputList) return;

    if (!items.length) {
      refs.inputList.innerHTML = '<div class="summary-line">' + escapeHtml(state.activeTool.inputMode === 'urls' ? 'Nenhuma ligação carregada.' : 'Nenhum ficheiro carregado.') + '</div>';
      return;
    }

    if (state.activeTool.inputMode === 'urls') {
      refs.inputList.innerHTML = items.map(function (url, index) {
        return [
          '<div class="input-item">',
          '<div>',
          '<div class="input-item__name">' + escapeHtml(url) + '</div>',
          '<div class="input-item__meta">Ligação ' + (index + 1) + '</div>',
          '</div>',
          '</div>',
        ].join('');
      }).join('');
      return;
    }

    refs.inputList.innerHTML = items.map(function (file, index) {
      const label = file.webkitRelativePath || file.name;
      return [
        '<div class="input-item">',
        '<div>',
        '<div class="input-item__name">' + escapeHtml(label) + '</div>',
        '<div class="input-item__meta">' + escapeHtml(formatBytes(file.size)) + '</div>',
        '</div>',
        '<button type="button" class="result-delete" data-remove-file="' + index + '">Remover</button>',
        '</div>',
      ].join('');
    }).join('');
    
    if (state.activeTool.id === 'pdf-insert' && items.length > 0) {
      initVisualEditor();
    }
    if (state.activeTool.id === 'image-watermark' && items.length > 0) {
      initImageWatermarkEditor();
    }
    if (state.activeTool.id === 'image-bg-remove' && items.length > 0) {
      initImageBgRemoveEditor();
    }
  }

  function isImageResult(result) {
    const url = result.url || result.href || '';
    const name = result.name || '';
    return /\.(jpg|jpeg|png|webp|gif|svg|bmp)(\?|#|$)/i.test(url) || 
           /\.(jpg|jpeg|png|webp|gif|svg|bmp)$/i.test(name) ||
           (result.meta && result.meta.toLowerCase().includes('imagem')) ||
           (result.meta && result.meta.toLowerCase().includes('image'));
  }

  window.copyTextToClipboard = function(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        alert('Link copiado para a área de transferência!');
      }).catch(function(err) {
        console.error('Erro ao copiar link:', err);
      });
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        alert('Link copiado para a área de transferência!');
      } catch (err) {
        console.error('Erro ao copiar link:', err);
      }
      document.body.removeChild(textarea);
    }
  };

  window.copyImageToClipboard = async function(imageUrl) {
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error('Status ' + res.status);
      const blob = await res.blob();
      
      let pngBlob = blob;
      if (blob.type !== 'image/png') {
        pngBlob = await new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((b) => {
              if (b) resolve(b);
              else reject(new Error('Erro na conversão para PNG'));
            }, 'image/png');
          };
          img.onerror = () => reject(new Error('Erro ao carregar imagem para conversão'));
          img.src = imageUrl;
        });
      }
      
      await navigator.clipboard.write([
        new ClipboardItem({
          [pngBlob.type]: pngBlob
        })
      ]);
      alert('Imagem copiada para a área de transferência!');
    } catch (err) {
      console.warn('Não foi possível copiar a imagem programaticamente (CORS ou restrição do navegador).', err);
      alert('Não foi possível copiar a imagem automaticamente devido a restrições de segurança do navegador ou do site original.\n\nDica: Clique com o botão direito do rato (ou mantenha pressionado) sobre a pré-visualização da imagem e selecione "Copiar imagem".');
    }
  };

  function renderResults() {
    if (!refs.resultsList) return;
    if (!state.results.length) {
      refs.resultsList.innerHTML = '<div class="summary-line">Ainda não há resultados.</div>';
      if (refs.downloadAllBtn) refs.downloadAllBtn.disabled = true;
      return;
    }

    if (refs.downloadAllBtn) {
      refs.downloadAllBtn.disabled = !hasDownloadableResults() || state.processing;
    }

    refs.resultsList.innerHTML = state.results.map(function (result, index) {
      const targetUrl = result.url || result.href;
      
      let actions = '';
      if (result.blob || result.download) {
        actions += '<a class="result-link" href="' + (result.url || escapeHtml(result.href)) + '" download="' + escapeHtml(result.name) + '">Descarregar</a>';
      } else {
        actions += '<a class="result-link" href="' + escapeHtml(result.href) + '" target="_blank" rel="noopener">Abrir</a>';
      }

      if (targetUrl) {
        actions += '<button type="button" class="result-link" style="margin-left: 0.25rem;" onclick="window.copyTextToClipboard(\'' + escapeHtml(targetUrl) + '\')">Copiar Link</button>';
        if (isImageResult(result)) {
          actions += '<button type="button" class="result-link" style="margin-left: 0.25rem;" onclick="window.copyImageToClipboard(\'' + escapeHtml(targetUrl) + '\')">Copiar Imagem</button>';
        }
      }

      let previewHtml = '';
      if (isImageResult(result) && targetUrl) {
        previewHtml = [
          '<div class="result-item__preview" style="margin-top: 0.6rem;">',
          '<img src="' + escapeHtml(targetUrl) + '" alt="' + escapeHtml(result.name) + '" style="max-width: 140px; max-height: 140px; border-radius: var(--radius); display: block; border: 1px solid var(--border); cursor: pointer;" onclick="window.open(\'' + escapeHtml(targetUrl) + '\', \'_blank\')" title="Clique para ampliar. Dica: Clique com o botão direito para copiar/guardar." />',
          '<span style="font-size: 0.68rem; color: var(--text-light); display: block; margin-top: 0.25rem; opacity: 0.85;">Dica: Clique com o botão direito na imagem para copiar diretamente.</span>',
          '</div>'
        ].join('');
      }

      return [
        '<article class="result-item">',
        '<div>',
        '<div class="result-item__name">' + escapeHtml(result.name) + '</div>',
        '<div class="result-item__meta">' + escapeHtml(result.meta || (result.blob ? formatBytes(result.blob.size) : 'Ligação externa')) + '</div>',
        previewHtml,
        '</div>',
        '<div class="result-item__actions">',
        actions,
        '</div>',
        '<button type="button" class="result-delete" data-remove-result="' + index + '">Remover</button>',
        '</article>',
      ].join('');
    }).join('');
  }

  function clearResults() {
    state.results.forEach(function (result) {
      if (result.url && result.blob) URL.revokeObjectURL(result.url);
    });
    state.results = [];
    renderResults();
  }

  function clearInputs() {
    state.files = [];
    if (refs.linkInput) refs.linkInput.value = '';
    renderInputs();
    updateCounters();
  }

  function removeFileAt(index) {
    if (index < 0 || index >= state.files.length) return;
    state.files.splice(index, 1);
    renderInputs();
    updateCounters();
  }

  function removeResultAt(index) {
    if (index < 0 || index >= state.results.length) return;
    const result = state.results[index];
    if (result && result.url && result.blob) URL.revokeObjectURL(result.url);
    state.results.splice(index, 1);
    renderResults();
    updateCounters();
  }

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    const accept = state.activeTool.inputMode === 'urls' ? '' : state.activeTool.accept;
    const seen = new Set(state.files.map(uniqueFileKey));
    let rejected = 0;

    incoming.forEach(function (file) {
      if (!matchesAccept(file, accept)) {
        rejected += 1;
        return;
      }
      const key = uniqueFileKey(file);
      if (seen.has(key)) return;
      seen.add(key);
      state.files.push(file);
    });

    renderInputs();
    updateCounters();

    if (rejected) {
      setRuntimeStatus('Ficheiros incompatíveis ignorados');
    } else if (incoming.length) {
      setRuntimeStatus('Ficheiros carregados');
    }
  }

  function addResults(results) {
    results.forEach(function (result) {
      state.results.push(result);
    });
    renderResults();
    updateCounters();
  }

  function createBlobResult(name, blob, meta) {
    return {
      name: name,
      blob: blob,
      url: URL.createObjectURL(blob),
      meta: meta || formatBytes(blob.size),
    };
  }

  function createExternalResult(name, href, meta) {
    return {
      name: name,
      href: href,
      meta: meta || 'Ligação externa',
    };
  }

  function makeOutputName(file, suffix, ext, index) {
    return String(index + 1).padStart(2, '0') + '-' + stem(file.name) + suffix + '.' + ext;
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) {
          reject(new Error('Não foi possível gerar a imagem.'));
          return;
        }
        resolve(blob);
      }, type, quality);
    });
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = function () {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Não foi possível carregar a imagem.'));
      };
      image.src = url;
    });
  }

  function getBackgroundColor(imageData, width, height) {
    const data = imageData.data;
    const points = [
      [0, 0],
      [Math.max(0, width - 1), 0],
      [0, Math.max(0, height - 1)],
      [Math.max(0, width - 1), Math.max(0, height - 1)],
      [Math.floor(width / 2), 0],
      [0, Math.floor(height / 2)],
      [Math.max(0, width - 1), Math.floor(height / 2)],
      [Math.floor(width / 2), Math.max(0, height - 1)],
    ];
    const total = points.reduce(function (acc, point) {
      const x = point[0];
      const y = point[1];
      const index = (y * width + x) * 4;
      acc.r += data[index];
      acc.g += data[index + 1];
      acc.b += data[index + 2];
      return acc;
    }, { r: 0, g: 0, b: 0 });

    return {
      r: total.r / points.length,
      g: total.g / points.length,
      b: total.b / points.length,
    };
  }

  function hexToRgb(hex) {
    hex = String(hex || '').trim().replace('#', '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    const num = parseInt(hex, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  function rgbToLab(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
    var x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
    var y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750) / 1.0;
    var z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;
    x = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x) + 16/116;
    y = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y) + 16/116;
    z = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z) + 16/116;
    return { L: (116 * y) - 16, a: 500 * (x - y), b: 200 * (y - z) };
  }

  function labDistance(lab1, lab2) {
    var dL = lab1.L - lab2.L;
    var da = lab1.a - lab2.a;
    var db = lab1.b - lab2.b;
    return Math.sqrt(dL * dL + da * da + db * db);
  }

  function floodFillMask(data, width, height, bgLab, limit) {
    var total = width * height;
    var mask = new Uint8Array(total);
    var queue = [];
    var labCache = new Float64Array(total * 3);
    for (var p = 0; p < total; p++) {
      var off = p * 4;
      var lab = rgbToLab(data[off], data[off + 1], data[off + 2]);
      labCache[p * 3] = lab.L;
      labCache[p * 3 + 1] = lab.a;
      labCache[p * 3 + 2] = lab.b;
    }
    function pixelLab(idx) {
      return { L: labCache[idx * 3], a: labCache[idx * 3 + 1], b: labCache[idx * 3 + 2] };
    }
    function seedEdge(x, y) {
      var idx = y * width + x;
      if (mask[idx]) return;
      var dist = labDistance(pixelLab(idx), bgLab);
      if (dist <= limit) {
        mask[idx] = 1;
        queue.push(idx);
      }
    }
    for (var x = 0; x < width; x++) { seedEdge(x, 0); seedEdge(x, height - 1); }
    for (var y = 1; y < height - 1; y++) { seedEdge(0, y); seedEdge(width - 1, y); }
    while (queue.length > 0) {
      var ci = queue.shift();
      var cx = ci % width;
      var cy = (ci - cx) / width;
      var neighbors = [
        [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]
      ];
      for (var n = 0; n < neighbors.length; n++) {
        var nx = neighbors[n][0], ny = neighbors[n][1];
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        var ni = ny * width + nx;
        if (mask[ni]) continue;
        var dist = labDistance(pixelLab(ni), bgLab);
        if (dist <= limit) {
          mask[ni] = 1;
          queue.push(ni);
        }
      }
    }
    return mask;
  }

  function morphErode(mask, w, h, radius) {
    if (radius <= 0) return mask;
    var out = new Uint8Array(mask.length);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = y * w + x;
        if (!mask[idx]) { out[idx] = 0; continue; }
        var keep = true;
        outer:
        for (var dy = -radius; dy <= radius; dy++) {
          for (var dx = -radius; dx <= radius; dx++) {
            var nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            if (!mask[ny * w + nx]) { keep = false; break outer; }
          }
        }
        out[idx] = keep ? 1 : 0;
      }
    }
    return out;
  }

  function morphDilate(mask, w, h, radius) {
    if (radius <= 0) return mask;
    var out = new Uint8Array(mask.length);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = y * w + x;
        if (mask[idx]) { out[idx] = 1; continue; }
        var fill = false;
        outer2:
        for (var dy = -radius; dy <= radius; dy++) {
          for (var dx = -radius; dx <= radius; dx++) {
            var nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            if (mask[ny * w + nx]) { fill = true; break outer2; }
          }
        }
        out[idx] = fill ? 1 : 0;
      }
    }
    return out;
  }

  function computeSobelEdge(data, w, h) {
    var gray = new Float64Array(w * h);
    for (var i = 0; i < w * h; i++) {
      var off = i * 4;
      gray[i] = 0.299 * data[off] + 0.587 * data[off + 1] + 0.114 * data[off + 2];
    }
    var edges = new Float64Array(w * h);
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var gx = -gray[(y-1)*w+(x-1)] + gray[(y-1)*w+(x+1)]
               -2*gray[y*w+(x-1)]    + 2*gray[y*w+(x+1)]
               -gray[(y+1)*w+(x-1)]  + gray[(y+1)*w+(x+1)];
        var gy = -gray[(y-1)*w+(x-1)] - 2*gray[(y-1)*w+x] - gray[(y-1)*w+(x+1)]
               +gray[(y+1)*w+(x-1)]  + 2*gray[(y+1)*w+x] + gray[(y+1)*w+(x+1)];
        edges[y * w + x] = Math.sqrt(gx * gx + gy * gy);
      }
    }
    return edges;
  }

  function gaussianBlurMask(alpha, w, h, radius) {
    if (radius <= 0) return alpha;
    var size = Math.ceil(radius * 2.5) | 0;
    if (size < 1) size = 1;
    var kernel = new Float64Array(size * 2 + 1);
    var sigma = radius;
    var sum = 0;
    for (var i = -size; i <= size; i++) {
      var val = Math.exp(-(i * i) / (2 * sigma * sigma));
      kernel[i + size] = val;
      sum += val;
    }
    for (var i = 0; i < kernel.length; i++) kernel[i] /= sum;
    var temp = new Float64Array(w * h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var acc = 0;
        for (var k = -size; k <= size; k++) {
          var sx = Math.max(0, Math.min(w - 1, x + k));
          acc += alpha[y * w + sx] * kernel[k + size];
        }
        temp[y * w + x] = acc;
      }
    }
    var out = new Float64Array(w * h);
    for (var x = 0; x < w; x++) {
      for (var y = 0; y < h; y++) {
        var acc = 0;
        for (var k = -size; k <= size; k++) {
          var sy = Math.max(0, Math.min(h - 1, y + k));
          acc += temp[sy * w + x] * kernel[k + size];
        }
        out[y * w + x] = acc;
      }
    }
    return out;
  }

  function applyBackgroundRemoval(ctx, width, height, threshold, softness, targetColor, edgeRefine, denoise, useFlood) {
    var imageData = ctx.getImageData(0, 0, width, height);
    var data = imageData.data;
    var bg = targetColor || getBackgroundColor(imageData, width, height);
    var limit = Number(threshold || 32);
    var soft = Math.max(0, Number(softness || 0));
    var edgeStr = Number(edgeRefine || 0) / 100;
    var denoiseR = Number(denoise || 0);
    var bgLab = rgbToLab(bg.r, bg.g, bg.b);
    var total = width * height;

    var rawMask;
    if (useFlood) {
      rawMask = floodFillMask(data, width, height, bgLab, limit * 0.65);
    } else {
      rawMask = new Uint8Array(total);
      for (var i = 0; i < total; i++) {
        var off = i * 4;
        var pLab = rgbToLab(data[off], data[off+1], data[off+2]);
        var dist = labDistance(pLab, bgLab);
        rawMask[i] = dist <= limit ? 1 : 0;
      }
    }

    if (denoiseR > 0) {
      rawMask = morphErode(rawMask, width, height, denoiseR);
      rawMask = morphDilate(rawMask, width, height, denoiseR);
      rawMask = morphDilate(rawMask, width, height, denoiseR);
      rawMask = morphErode(rawMask, width, height, denoiseR);
    }

    var alphaMask = new Float64Array(total);
    for (var i = 0; i < total; i++) {
      if (rawMask[i]) {
        alphaMask[i] = 0.0;
      } else {
        var off = i * 4;
        var pLab = rgbToLab(data[off], data[off+1], data[off+2]);
        var dist = labDistance(pLab, bgLab);
        if (soft > 0 && dist < limit + soft) {
          alphaMask[i] = Math.min(1.0, (dist - limit * 0.5) / (soft + limit * 0.5));
        } else {
          alphaMask[i] = 1.0;
        }
      }
    }

    if (soft > 1) {
      var blurRadius = soft / 12;
      alphaMask = gaussianBlurMask(alphaMask, width, height, blurRadius);
    }

    if (edgeStr > 0) {
      var edges = computeSobelEdge(data, width, height);
      var maxEdge = 0;
      for (var i = 0; i < total; i++) {
        if (edges[i] > maxEdge) maxEdge = edges[i];
      }
      if (maxEdge > 0) {
        for (var i = 0; i < total; i++) {
          var edgeNorm = edges[i] / maxEdge;
          if (edgeNorm > 0.08) {
            alphaMask[i] = Math.min(1.0, alphaMask[i] + edgeNorm * edgeStr);
          }
        }
      }
    }

    for (var i = 0; i < total; i++) {
      var a = Math.max(0, Math.min(255, Math.round(alphaMask[i] * 255)));
      data[i * 4 + 3] = a;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  function buildImageWatermark(ctx, width, height, options) {
    const text = String(options.imageWatermarkText || 'Luis Maximo');
    const opacity = Number(options.imageWatermarkOpacity || 0.28);
    const position = String(options.imageWatermarkPosition || 'corner');
    const fontSize = Math.max(18, Math.round(width / 26));

    ctx.font = '600 ' + fontSize + 'px Outfit, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,' + opacity + ')';
    ctx.strokeStyle = 'rgba(0,0,0,' + Math.min(0.32, opacity + 0.04) + ')';
    ctx.lineWidth = Math.max(2, Math.round(fontSize / 10));

    if (position === 'center') {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const x = width / 2;
      const y = height / 2;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-Math.PI / 10);
      ctx.strokeText(text, 0, 0);
      ctx.fillText(text, 0, 0);
      ctx.restore();
      return;
    }

    if (position === 'tile') {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = 'rgb(255,255,255)';
      ctx.strokeStyle = 'rgba(0,0,0,0.32)';
      ctx.translate(width * 0.06, height * 0.12);
      ctx.rotate(-Math.PI / 10);
      const stepX = Math.max(180, Math.round(fontSize * 6));
      const stepY = Math.max(110, Math.round(fontSize * 3.4));
      for (let y = -height; y < height * 1.6; y += stepY) {
        for (let x = -width; x < width * 1.6; x += stepX) {
          ctx.strokeText(text, x, y);
          ctx.fillText(text, x, y);
        }
      }
      ctx.restore();
      return;
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.strokeText(text, width - 24, height - 24);
    ctx.fillText(text, width - 24, height - 24);
  }

  function normalizeVideoScale(options) {
    const width = optionalNumber(options.videoWidth);
    const height = optionalNumber(options.videoHeight);
    if (!width && !height) return null;
    const left = width || -2;
    const right = height || -2;
    return 'scale=' + left + ':' + right + ':flags=lanczos';
  }

  async function processPdfRasterize(files, options) {
    const { PDFDocument } = await ensurePdfLib();
    const pdfjs = await ensurePdfJs();
    const scale = Number(options.pdfScale || 1.65);

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setProgress((index / files.length) * 100, 'A rasterizar PDF', file.name);
      const srcBytes = new Uint8Array(await file.arrayBuffer());
      const srcPdf = await pdfjs.getDocument({ data: srcBytes }).promise;
      const outPdf = await PDFDocument.create();

      for (let pageIndex = 1; pageIndex <= srcPdf.numPages; pageIndex += 1) {
        const page = await srcPdf.getPage(pageIndex);
        const viewport = page.getViewport({ scale: scale });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { alpha: false });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        const pngBlob = await canvasToBlob(canvas, 'image/png');
        const pngBuffer = await pngBlob.arrayBuffer();
        const image = await outPdf.embedPng(pngBuffer);
        const pdfPage = outPdf.addPage([viewport.width / scale, viewport.height / scale]);
        pdfPage.drawImage(image, {
          x: 0,
          y: 0,
          width: viewport.width / scale,
          height: viewport.height / scale,
        });
        setProgress(((index + (pageIndex / srcPdf.numPages)) / files.length) * 100, 'A rasterizar PDF', file.name + ' · página ' + pageIndex);
      }

      const bytesOut = await outPdf.save();
      addResults([createBlobResult(makeOutputName(file, '-imagem-only', 'pdf', index), new Blob([bytesOut], { type: 'application/pdf' }))]);
    }
  }

  async function processPdfToImage(files, options) {
    const pdfjs = await ensurePdfJs();
    const format = String(options.pdfToImageFormat || 'image/png');
    const scale = Number(options.pdfToImageScale || 1.65);
    const ext = format.split('/')[1] || 'png';

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setProgress((index / files.length) * 100, 'A converter PDF para imagem', file.name);
      const srcBytes = new Uint8Array(await file.arrayBuffer());
      const srcPdf = await pdfjs.getDocument({ data: srcBytes }).promise;

      for (let pageIndex = 1; pageIndex <= srcPdf.numPages; pageIndex += 1) {
        const page = await srcPdf.getPage(pageIndex);
        const viewport = page.getViewport({ scale: scale });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { alpha: format === 'image/png' });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        const blob = await canvasToBlob(canvas, format, 0.9);
        const pageSuffix = '-pagina-' + pageIndex;
        addResults([
          createBlobResult(makeOutputName(file, pageSuffix, ext, index), blob)
        ]);
        setProgress(((index + (pageIndex / srcPdf.numPages)) / files.length) * 100, 'A converter PDF', file.name + ' · pág ' + pageIndex);
      }
    }
  }

  async function processImageToPdf(files, options) {
    const { PDFDocument } = await ensurePdfLib();
    const outPdf = await PDFDocument.create();
    const margin = Number(options.imageToPdfMargin || 0);

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setProgress((index / files.length) * 100, 'A converter imagem para PDF', file.name);
      
      const image = await loadImage(file);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      ctx.drawImage(image, 0, 0);

      const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
      const jpegBuffer = await jpegBlob.arrayBuffer();
      const embeddedImage = await outPdf.embedJpg(jpegBuffer);

      const pageWidth = image.naturalWidth + margin * 2;
      const pageHeight = image.naturalHeight + margin * 2;
      const pdfPage = outPdf.addPage([pageWidth, pageHeight]);

      pdfPage.drawImage(embeddedImage, {
        x: margin,
        y: margin,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    }

    const bytesOut = await outPdf.save();
    addResults([
      createBlobResult('imagens-juntas.pdf', new Blob([bytesOut], { type: 'application/pdf' })),
    ]);
  }

  let mouseX = null;
  let mouseY = null;

  function updateBgRemoveControlsUI() {
    const brushModeSelect = document.getElementById('bgRemoveBrushMode');
    const brushMode = brushModeSelect ? brushModeSelect.value : 'select-color';
    state.bgRemove.brushMode = brushMode;

    const brushSizeGroup = document.getElementById('bgRemoveBrushSizeGroup');
    const clearEditsBtn = document.getElementById('bgRemoveClearEdits');

    if (brushMode === 'erase' || brushMode === 'restore') {
      if (brushSizeGroup) brushSizeGroup.hidden = false;
      if (clearEditsBtn) {
        clearEditsBtn.hidden = !state.bgRemove.hasEdits;
      }
    } else {
      if (brushSizeGroup) brushSizeGroup.hidden = true;
      if (clearEditsBtn) clearEditsBtn.hidden = true;
    }
  }

  function clearBgRemoveEdits() {
    const maskCanvas = state.bgRemove.maskCanvas;
    const maskCtx = state.bgRemove.maskCtx;
    if (!maskCanvas || !maskCtx) return;
    maskCtx.fillStyle = '#808080';
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    state.bgRemove.hasEdits = false;
    updateBgRemoveControlsUI();
    renderImageBgRemovePreview();
  }

  function drawBrush(event, isStart) {
    const canvas = refs.imageBgRemoveCanvas;
    const image = state.bgRemove.image;
    if (!image || !canvas || !state.bgRemove.maskCtx) return;

    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);

    const scaleX = image.naturalWidth / canvas.width;
    const scaleY = image.naturalHeight / canvas.height;
    const naturalX = x * scaleX;
    const naturalY = y * scaleY;

    const brushSizeSelect = document.getElementById('bgRemoveBrushSize');
    const brushSize = Number(brushSizeSelect ? brushSizeSelect.value : 30);
    const naturalBrushSize = brushSize * scaleX;

    const ctx = state.bgRemove.maskCtx;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = naturalBrushSize;
    ctx.strokeStyle = state.bgRemove.brushMode === 'erase' ? '#000000' : '#ffffff';

    if (isStart || state.bgRemove.lastX === undefined) {
      ctx.beginPath();
      ctx.arc(naturalX, naturalY, naturalBrushSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(state.bgRemove.lastX, state.bgRemove.lastY);
      ctx.lineTo(naturalX, naturalY);
      ctx.stroke();
    }
    ctx.restore();

    state.bgRemove.lastX = naturalX;
    state.bgRemove.lastY = naturalY;
    state.bgRemove.hasEdits = true;
    updateBgRemoveControlsUI();
    renderImageBgRemovePreview();
  }

  function handleBgRemoveMouseMove(event) {
    const canvas = refs.imageBgRemoveCanvas;
    if (!canvas || !state.bgRemove.image) return;

    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;

    if (state.bgRemove.brushMode === 'erase' || state.bgRemove.brushMode === 'restore') {
      if (state.bgRemove.isDrawing) {
        drawBrush(event, false);
      } else {
        renderImageBgRemovePreview();
      }
    }
  }

  function handleBgRemoveMouseLeave() {
    mouseX = null;
    mouseY = null;
    if (state.bgRemove.isDrawing) {
      state.bgRemove.isDrawing = false;
      state.bgRemove.lastX = undefined;
      state.bgRemove.lastY = undefined;
    }
    renderImageBgRemovePreview();
  }

  function composeBgRemoval(canvas, ctx, image, scale) {
    const w = canvas.width;
    const h = canvas.height;

    const origCanvas = document.createElement('canvas');
    origCanvas.width = w;
    origCanvas.height = h;
    const origCtx = origCanvas.getContext('2d');
    origCtx.drawImage(image, 0, 0, w, h);
    const origData = origCtx.getImageData(0, 0, w, h).data;

    const baseData = state.bgRemove.baseCtx.getImageData(0, 0, w, h).data;

    const maskTempCanvas = document.createElement('canvas');
    maskTempCanvas.width = w;
    maskTempCanvas.height = h;
    const maskTempCtx = maskTempCanvas.getContext('2d');
    if (state.bgRemove.maskCanvas) {
      maskTempCtx.drawImage(state.bgRemove.maskCanvas, 0, 0, w, h);
    } else {
      maskTempCtx.fillStyle = '#808080';
      maskTempCtx.fillRect(0, 0, w, h);
    }
    const maskData = maskTempCtx.getImageData(0, 0, w, h).data;

    const outImgData = ctx.createImageData(w, h);
    const outData = outImgData.data;

    for (let i = 0; i < outData.length; i += 4) {
      const mx = maskData[i];
      if (mx < 64) {
        outData[i] = origData[i];
        outData[i + 1] = origData[i + 1];
        outData[i + 2] = origData[i + 2];
        outData[i + 3] = 0;
      } else if (mx > 192) {
        outData[i] = origData[i];
        outData[i + 1] = origData[i + 1];
        outData[i + 2] = origData[i + 2];
        outData[i + 3] = origData[i + 3];
      } else {
        outData[i] = baseData[i];
        outData[i + 1] = baseData[i + 1];
        outData[i + 2] = baseData[i + 2];
        outData[i + 3] = baseData[i + 3];
      }
    }

    ctx.putImageData(outImgData, 0, 0);
  }

  async function initImageBgRemoveEditor() {
    if (!state.files.length || !refs.imageBgRemoveCanvas) return;
    try {
      setRuntimeStatus('A carregar pré-visualização da imagem...');
      const file = state.files[0];
      const image = await loadImage(file);
      state.bgRemove.image = image;

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = image.naturalWidth;
      maskCanvas.height = image.naturalHeight;
      const maskCtx = maskCanvas.getContext('2d');
      maskCtx.fillStyle = '#808080';
      maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

      state.bgRemove.maskCanvas = maskCanvas;
      state.bgRemove.maskCtx = maskCtx;
      state.bgRemove.baseNeedsUpdate = true;
      state.bgRemove.hasEdits = false;
      state.bgRemove.brushMode = 'select-color';

      const brushModeSelect = document.getElementById('bgRemoveBrushMode');
      if (brushModeSelect) brushModeSelect.value = 'select-color';

      updateBgRemoveControlsUI();
      renderImageBgRemovePreview();
      setRuntimeStatus('Editor de remoção de fundo pronto');
    } catch (err) {
      console.error(err);
      setRuntimeStatus('Erro ao carregar pré-visualização');
    }
  }

  function renderImageBgRemovePreview() {
    const image = state.bgRemove.image;
    const canvas = refs.imageBgRemoveCanvas;
    if (!image || !canvas) return;

    const maxWidth = 800;
    const scale = Math.min(1.5, maxWidth / image.naturalWidth);
    canvas.width = image.naturalWidth * scale;
    canvas.height = image.naturalHeight * scale;

    const ctx = canvas.getContext('2d');

    if (!state.bgRemove.baseCanvas || state.bgRemove.baseCanvas.width !== canvas.width || state.bgRemove.baseCanvas.height !== canvas.height || state.bgRemove.baseNeedsUpdate) {
      const baseCanvas = state.bgRemove.baseCanvas || document.createElement('canvas');
      baseCanvas.width = canvas.width;
      baseCanvas.height = canvas.height;
      const baseCtx = baseCanvas.getContext('2d');
      baseCtx.drawImage(image, 0, 0, canvas.width, canvas.height);

      const options = getOptions();
      const threshold = Number(options.bgThreshold || 32);
      const softness = Number(options.bgSoftness || 15);
      const edgeRefine = Number(options.bgEdgeRefine || 40);
      const denoise = Number(options.bgDenoise || 1);
      const mode = options.bgMode || 'flood';

      let targetColor = null;
      if (mode === 'white') {
        targetColor = { r: 255, g: 255, b: 255 };
      } else if (mode === 'black') {
        targetColor = { r: 0, g: 0, b: 0 };
      } else if (mode === 'color') {
        targetColor = hexToRgb(options.bgColor || '#ffffff');
      }

      var useFlood = mode === 'flood';
      applyBackgroundRemoval(baseCtx, canvas.width, canvas.height, threshold, softness, targetColor, edgeRefine, denoise, useFlood);

      state.bgRemove.baseCanvas = baseCanvas;
      state.bgRemove.baseCtx = baseCtx;
      state.bgRemove.baseNeedsUpdate = false;
    }

    composeBgRemoval(canvas, ctx, image, scale);

    if (mouseX !== null && mouseY !== null && (state.bgRemove.brushMode === 'erase' || state.bgRemove.brushMode === 'restore')) {
      const brushSizeSelect = document.getElementById('bgRemoveBrushSize');
      const brushSize = Number(brushSizeSelect ? brushSizeSelect.value : 30);
      ctx.save();
      ctx.beginPath();
      ctx.arc(mouseX, mouseY, brushSize / 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(mouseX, mouseY, brushSize / 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  async function initImageWatermarkEditor() {
    if (!state.files.length || !refs.imageWatermarkCanvas) return;
    try {
      setRuntimeStatus('A carregar pré-visualização da imagem...');
      const file = state.files[0];
      const image = await loadImage(file);
      state.imageWatermark.image = image;
      
      const maxWidth = 800;
      const scale = Math.min(1.5, maxWidth / image.naturalWidth);
      state.imageWatermark.scale = scale;
      
      refs.imageWatermarkCanvas.width = image.naturalWidth * scale;
      refs.imageWatermarkCanvas.height = image.naturalHeight * scale;
      
      const ctx = refs.imageWatermarkCanvas.getContext('2d');
      ctx.drawImage(image, 0, 0, refs.imageWatermarkCanvas.width, refs.imageWatermarkCanvas.height);
      
      if (refs.imageWatermarkOverlay) refs.imageWatermarkOverlay.innerHTML = '';
      state.imageWatermark.elements = [];
      state.imageWatermark.activeElement = null;
      
      setRuntimeStatus('Editor visual de marca pronto');
    } catch (err) {
      console.error(err);
      setRuntimeStatus('Erro ao carregar pré-visualização');
    }
  }

  function selectImageWatermarkElement(el) {
    if (state.imageWatermark.activeElement) {
      const prevNode = state.imageWatermark.activeElement.node;
      prevNode.style.borderColor = 'transparent';
      if (state.imageWatermark.activeElement.type === 'text') {
        prevNode.style.borderStyle = 'dashed';
        prevNode.style.borderColor = 'var(--accent-mid)';
      }
    }
    
    state.imageWatermark.activeElement = el;
    el.node.style.borderColor = 'var(--accent-mid)';
    el.node.style.borderStyle = 'solid';
    
    if (el.type === 'text') {
      if (refs.imageTextColor) {
        refs.imageTextColor.value = rgbToHex(el.node.style.color) || '#ffffff';
      }
      if (refs.imageTextSize) {
        const size = parseFloat(el.node.style.fontSize) || 48;
        refs.imageTextSize.value = String(Math.round(size));
      }
    }
    
    if (refs.imageElementRotation) {
      refs.imageElementRotation.value = el.node.dataset.rotation || '0';
    }
    if (refs.imageElementOpacity) {
      refs.imageElementOpacity.value = el.node.style.opacity || '0.5';
    }
  }

  function addImageWatermarkText() {
    if (!state.imageWatermark.image) {
      alert('Carrega primeiro uma imagem.');
      return;
    }
    const node = document.createElement('div');
    node.contentEditable = 'false';
    node.textContent = 'Marca de Água';
    node.style.position = 'absolute';
    node.style.left = '50px';
    node.style.top = '50px';
    node.style.color = refs.imageTextColor ? refs.imageTextColor.value : '#ffffff';
    node.style.fontSize = (refs.imageTextSize ? refs.imageTextSize.value : '48') + 'px';
    node.style.fontFamily = 'Outfit, sans-serif';
    node.style.fontWeight = 'bold';
    node.style.whiteSpace = 'pre-wrap';
    node.style.cursor = 'grab';
    node.style.padding = '6px 10px';
    node.style.border = '1px dashed var(--accent-mid)';
    node.style.minWidth = '100px';
    node.style.pointerEvents = 'auto';
    node.style.borderRadius = '4px';
    node.style.background = 'rgba(0, 0, 0, 0.2)';
    node.style.userSelect = 'none';
    node.dataset.rotation = '0';
    node.style.opacity = refs.imageElementOpacity ? refs.imageElementOpacity.value : '0.5';
    
    const el = { type: 'text', node: node };
    
    node.addEventListener('dblclick', function () {
      node.contentEditable = 'true';
      node.style.cursor = 'text';
      node.style.border = '1px solid var(--accent-mid)';
      node.style.userSelect = 'text';
      node.focus();
      
      const range = document.createRange();
      range.selectNodeContents(node);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    
    node.addEventListener('blur', function () {
      node.contentEditable = 'false';
      node.style.cursor = 'grab';
      node.style.border = '1px dashed var(--accent-mid)';
      node.style.userSelect = 'none';
    });
    
    node.addEventListener('mousedown', function () {
      selectImageWatermarkElement(el);
    });
    
    makeDraggable(node);
    if (refs.imageWatermarkOverlay) refs.imageWatermarkOverlay.appendChild(node);
    state.imageWatermark.elements.push(el);
    selectImageWatermarkElement(el);
  }

  async function addImageWatermarkImage(file) {
    if (!state.imageWatermark.image) {
      alert('Carrega primeiro uma imagem.');
      return;
    }
    const url = URL.createObjectURL(file);
    const node = document.createElement('img');
    node.src = url;
    node.style.position = 'absolute';
    node.style.left = '50px';
    node.style.top = '50px';
    node.style.maxWidth = '200px';
    node.style.cursor = 'grab';
    node.style.border = '2px solid transparent';
    node.style.pointerEvents = 'auto';
    node.dataset.originalFile = url;
    node.dataset.rotation = '0';
    node.style.opacity = refs.imageElementOpacity ? refs.imageElementOpacity.value : '0.5';
    
    const buffer = await file.arrayBuffer();
    const el = { type: 'image', node: node, file: file, buffer: buffer };
    
    node.addEventListener('mousedown', function () {
      selectImageWatermarkElement(el);
    });
    
    makeDraggable(node);
    if (refs.imageWatermarkOverlay) refs.imageWatermarkOverlay.appendChild(node);
    state.imageWatermark.elements.push(el);
    selectImageWatermarkElement(el);
  }

  async function processImageWatermarkVisual(files, options) {
    const format = String(options.imageWatermarkOutFormat || 'image/webp');
    const quality = Number(options.imageWatermarkOutQuality || 0.9);
    const elements = state.imageWatermark.elements;
    
    if (!elements.length) {
      throw new Error('Adiciona pelo menos um elemento de marca de água (texto ou logótipo).');
    }
    
    const canvasW = refs.imageWatermarkCanvas.width;
    const canvasH = refs.imageWatermarkCanvas.height;
    
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setProgress((index / files.length) * 100, 'A aplicar marca de água', file.name);
      
      const image = await loadImage(file);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      ctx.drawImage(image, 0, 0);
      
      const ratioX = image.naturalWidth / canvasW;
      const ratioY = image.naturalHeight / canvasH;
      
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const uiX = el.node.offsetLeft;
        const uiY = el.node.offsetTop;
        const uiW = el.node.offsetWidth;
        const uiH = el.node.offsetHeight;
        
        const destX = uiX * ratioX;
        const destY = uiY * ratioY;
        const destW = uiW * ratioX;
        const destH = uiH * ratioY;
        const rotationRad = Number(el.node.dataset.rotation || 0) * Math.PI / 180;
        const opacity = Number(el.node.style.opacity || 0.5);
        
        ctx.save();
        ctx.globalAlpha = opacity;
        
        if (el.type === 'text') {
          const textContent = el.node.innerText || el.node.textContent;
          const fontSizeStr = window.getComputedStyle(el.node).fontSize;
          const uiFontSize = parseFloat(fontSizeStr) || 48;
          
          const destFontSize = uiFontSize * ratioY;
          ctx.font = 'bold ' + destFontSize + 'px Outfit, sans-serif';
          ctx.fillStyle = el.node.style.color || '#ffffff';
          
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = Math.max(2, Math.round(destFontSize / 12));
          
          ctx.translate(destX + destW / 2, destY + destH / 2);
          ctx.rotate(rotationRad);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          const lines = textContent.split('\n');
          let currentOffsetY = -((lines.length - 1) * destFontSize * 1.2) / 2;
          for (let j = 0; j < lines.length; j += 1) {
            ctx.strokeText(lines[j], 0, currentOffsetY);
            ctx.fillText(lines[j], 0, currentOffsetY);
            currentOffsetY += destFontSize * 1.2;
          }
        } else if (el.type === 'image') {
          const imgLogo = el.node;
          ctx.translate(destX + destW / 2, destY + destH / 2);
          ctx.rotate(rotationRad);
          ctx.drawImage(imgLogo, -destW / 2, -destH / 2, destW, destH);
        }
        
        ctx.restore();
      }
      
      const blob = await canvasToBlob(canvas, format, quality);
      addResults([
        createBlobResult(makeOutputName(file, '-marca', extForFormat(format), index), blob)
      ]);
    }
  }

  async function processPdfWatermark(files, options) {
    const { PDFDocument, StandardFonts, rgb, degrees } = await ensurePdfLib();

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setProgress((index / files.length) * 100, 'A aplicar marca de água', file.name);
      const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const text = String(options.watermarkText || 'CONFIDENCIAL');
      const opacity = Number(options.watermarkOpacity || 0.18);
      const angle = Number(options.watermarkAngle || 35);

      pdfDoc.getPages().forEach(function (page) {
        const size = page.getSize();
        page.drawText(text, {
          x: size.width * 0.16,
          y: size.height * 0.48,
          size: Math.min(size.width, size.height) / 10,
          font: font,
          color: rgb(0.55, 0.05, 0.05),
          opacity: opacity,
          rotate: degrees(angle),
        });
      });

      addResults([createBlobResult(makeOutputName(file, '-marca-agua', 'pdf', index), new Blob([await pdfDoc.save()], { type: 'application/pdf' }))]);
    }
  }

  async function processPdfSign(files, options) {
    const { PDFDocument, StandardFonts, rgb } = await ensurePdfLib();

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setProgress((index / files.length) * 100, 'A assinar PDF', file.name);
      const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();
      const mode = String(options.signaturePage || 'last');
      const targetPages = mode === 'all'
        ? pages
        : [mode === 'first' ? pages[0] : pages[pages.length - 1]];

      targetPages.forEach(function (page) {
        const size = page.getSize();
        page.drawText(String(options.signatureText || 'Assinado'), {
          x: Math.max(28, size.width - 230),
          y: 32,
          size: 16,
          font: font,
          color: rgb(0.1, 0.24, 0.18),
        });
      });

      addResults([createBlobResult(makeOutputName(file, '-assinado', 'pdf', index), new Blob([await pdfDoc.save()], { type: 'application/pdf' }))]);
    }
  }

  async function processPdfMerge(files) {
    const { PDFDocument } = await ensurePdfLib();
    const outPdf = await PDFDocument.create();

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setProgress((index / files.length) * 100, 'A juntar PDFs', file.name);
      const srcPdf = await PDFDocument.load(await file.arrayBuffer());
      const copiedPages = await outPdf.copyPages(srcPdf, srcPdf.getPageIndices());
      copiedPages.forEach(function (page) {
        outPdf.addPage(page);
      });
    }

    addResults([
      createBlobResult('pdfs-juntos.pdf', new Blob([await outPdf.save()], { type: 'application/pdf' })),
    ]);
  }

  async function renderVisualEditorPage() {
    if (!state.visualEditor.pdfDoc || !refs.visualCanvas) return;
    const pageIndex = Math.max(0, Math.min(state.visualEditor.pdfDoc.numPages - 1, state.visualEditor.pageIndex - 1));
    const page = await state.visualEditor.pdfDoc.getPage(pageIndex + 1);
    
    // Calcula escala para caber na div (max 800px width aprox)
    const viewportUnscaled = page.getViewport({ scale: 1 });
    const scale = Math.min(1.5, 800 / viewportUnscaled.width);
    const viewport = page.getViewport({ scale: scale });
    
    state.visualEditor.scale = scale;
    state.visualEditor.pdfPage = page;
    
    refs.visualCanvas.width = viewport.width;
    refs.visualCanvas.height = viewport.height;
    
    const ctx = refs.visualCanvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
  }

  async function initVisualEditor() {
    if (!state.files.length) return;
    try {
      setRuntimeStatus('A carregar pré-visualização...');
      const file = state.files[0];
      const srcBytes = new Uint8Array(await file.arrayBuffer());
      const pdfjs = await ensurePdfJs();
      state.visualEditor.pdfDoc = await pdfjs.getDocument({ data: srcBytes }).promise;
      state.visualEditor.pageIndex = 1;
      
      if (refs.visualEditorPage) {
        refs.visualEditorPage.innerHTML = Array.from({ length: state.visualEditor.pdfDoc.numPages }, function (_, i) {
          return '<option value="' + (i + 1) + '">Página ' + (i + 1) + '</option>';
        }).join('');
      }
      
      if (refs.visualOverlay) refs.visualOverlay.innerHTML = '';
      state.visualEditor.elements = [];
      
      await renderVisualEditorPage();
      setRuntimeStatus('Editor visual pronto');
    } catch (err) {
      console.error(err);
      setRuntimeStatus('Erro na pré-visualização');
    }
  }

  function makeDraggable(node) {
    let isDown = false;
    let startX = 0;
    let startY = 0;
    let initialX = 0;
    let initialY = 0;
    
    node.addEventListener('mousedown', function (e) {
      if (node.contentEditable === 'true') {
        return;
      }
      isDown = true;
      startX = e.clientX;
      startY = e.clientY;
      initialX = node.offsetLeft;
      initialY = node.offsetTop;
      node.style.cursor = 'grabbing';
      e.preventDefault();
    });
    
    node.addEventListener('dragstart', function (e) {
      e.preventDefault();
    });
    
    document.addEventListener('mousemove', function (e) {
      if (!isDown) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      node.style.left = (initialX + dx) + 'px';
      node.style.top = (initialY + dy) + 'px';
    });
    
    document.addEventListener('mouseup', function () {
      if (isDown) {
        isDown = false;
        node.style.cursor = 'grab';
      }
    });
  }

  function rgbToHex(color) {
    if (!color) return null;
    const match = color.match(/\d+/g);
    if (!match || match.length < 3) return null;
    const r = parseInt(match[0]);
    const g = parseInt(match[1]);
    const b = parseInt(match[2]);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function selectVisualElement(el) {
    if (state.visualEditor.activeElement) {
      const prevNode = state.visualEditor.activeElement.node;
      prevNode.style.borderColor = 'transparent';
      if (state.visualEditor.activeElement.type === 'text') {
        prevNode.style.borderStyle = 'dashed';
        prevNode.style.borderColor = 'var(--accent-mid)';
      }
    }
    
    state.visualEditor.activeElement = el;
    el.node.style.borderColor = 'var(--accent-mid)';
    el.node.style.borderStyle = 'solid';
    
    if (el.type === 'text') {
      if (refs.visualTextColor) {
        refs.visualTextColor.value = rgbToHex(el.node.style.color) || '#2d6a4f';
      }
      if (refs.visualTextSize) {
        const size = parseFloat(el.node.style.fontSize) || 18;
        refs.visualTextSize.value = String(Math.round(size));
      }
    }
    
    if (refs.visualElementRotation) {
      refs.visualElementRotation.value = el.node.dataset.rotation || '0';
    }
    if (refs.visualElementOpacity) {
      refs.visualElementOpacity.value = el.node.style.opacity || '1';
    }
  }

  function repeatActiveElementOnAllPages() {
    const active = state.visualEditor.activeElement;
    if (!active) return;
    active.node.dataset.repeatAll = 'true';
    active.node.style.borderStyle = 'double';
    active.node.style.borderWidth = '3px';
    active.node.style.borderColor = 'var(--accent-mid)';
    alert('Este elemento será desenhado em todas as páginas do PDF.');
  }

  function addVisualText() {
    const node = document.createElement('div');
    node.contentEditable = 'false';
    node.textContent = 'Escreve aqui...';
    node.style.position = 'absolute';
    node.style.left = '50px';
    node.style.top = '50px';
    node.style.color = refs.visualTextColor ? refs.visualTextColor.value : '#2d6a4f';
    node.style.fontSize = (refs.visualTextSize ? refs.visualTextSize.value : '18') + 'px';
    node.style.fontFamily = 'Helvetica, Arial, sans-serif';
    node.style.whiteSpace = 'pre-wrap';
    node.style.cursor = 'grab';
    node.style.padding = '6px 10px';
    node.style.border = '1px dashed var(--accent-mid)';
    node.style.minWidth = '100px';
    node.style.pointerEvents = 'auto';
    node.style.borderRadius = '4px';
    node.style.background = 'rgba(255, 255, 255, 0.85)';
    node.style.userSelect = 'none';
    node.dataset.rotation = '0';
    node.style.opacity = '1';
    
    const el = { type: 'text', node: node };
    
    node.addEventListener('dblclick', function () {
      node.contentEditable = 'true';
      node.style.cursor = 'text';
      node.style.border = '1px solid var(--accent-mid)';
      node.style.userSelect = 'text';
      node.focus();
      
      const range = document.createRange();
      range.selectNodeContents(node);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    
    node.addEventListener('blur', function () {
      node.contentEditable = 'false';
      node.style.cursor = 'grab';
      node.style.border = '1px dashed var(--accent-mid)';
      node.style.userSelect = 'none';
    });
    
    node.addEventListener('mousedown', function () {
      selectVisualElement(el);
    });
    
    makeDraggable(node);
    if (refs.visualOverlay) refs.visualOverlay.appendChild(node);
    state.visualEditor.elements.push(el);
    selectVisualElement(el);
  }

  async function addVisualImage(file) {
    const url = URL.createObjectURL(file);
    const node = document.createElement('img');
    node.src = url;
    node.style.position = 'absolute';
    node.style.left = '50px';
    node.style.top = '50px';
    node.style.maxWidth = '200px';
    node.style.cursor = 'grab';
    node.style.border = '2px solid transparent';
    node.style.pointerEvents = 'auto';
    node.dataset.originalFile = url;
    node.dataset.rotation = '0';
    node.style.opacity = '1';
    
    const buffer = await file.arrayBuffer();
    const el = { type: 'image', node: node, file: file, buffer: buffer };
    
    node.addEventListener('mousedown', function () {
      selectVisualElement(el);
    });
    
    makeDraggable(node);
    if (refs.visualOverlay) refs.visualOverlay.appendChild(node);
    state.visualEditor.elements.push(el);
    selectVisualElement(el);
  }

  async function processPdfInsertVisual(files) {
    const { PDFDocument, StandardFonts, rgb, degrees } = await ensurePdfLib();

    function hexToRgb(hex) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255
      } : { r: 0, g: 0, b: 0 };
    }

    const targetPageNum = state.visualEditor.pageIndex;
    const elements = state.visualEditor.elements;
    const scale = state.visualEditor.scale;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setProgress((index / files.length) * 100, 'A inserir no PDF', file.name);
      
      const pdfBytes = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();
      const pageIndex = Math.min(targetPageNum - 1, pages.length - 1);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const isRepeat = el.node.dataset.repeatAll === 'true';
        
        const uiX = el.node.offsetLeft;
        const uiY = el.node.offsetTop;
        const uiHeight = el.node.offsetHeight;
        const uiWidth = el.node.offsetWidth;
        
        const pdfX = uiX / scale;
        const targetPagesList = isRepeat ? pages : [pages[pageIndex]];
        
        for (let pIdx = 0; pIdx < targetPagesList.length; pIdx++) {
          const page = targetPagesList[pIdx];
          const pdfHeight = page.getSize().height;
          const pdfY = pdfHeight - ((uiY + uiHeight) / scale);
          
          if (el.type === 'text') {
            const textContent = el.node.innerText || el.node.textContent;
            if (!textContent.trim()) continue;
            
            const fontSizeStr = window.getComputedStyle(el.node).fontSize;
            const uiFontSize = parseFloat(fontSizeStr) || 16;
            const pdfFontSize = uiFontSize / scale;
            
            const colorMatch = window.getComputedStyle(el.node).color.match(/\d+/g);
            let r = 0, g = 0, b = 0;
            if (colorMatch && colorMatch.length >= 3) {
              r = parseInt(colorMatch[0]) / 255;
              g = parseInt(colorMatch[1]) / 255;
              b = parseInt(colorMatch[2]) / 255;
            }

            const lines = textContent.split('\n');
            let currentY = pdfY + uiHeight / scale - (pdfFontSize * 1.2);
            
            for (let j = 0; j < lines.length; j += 1) {
              page.drawText(lines[j], {
                x: pdfX,
                y: currentY,
                size: pdfFontSize,
                font: font,
                color: rgb(r, g, b),
                rotate: degrees(Number(el.node.dataset.rotation || 0)),
                opacity: Number(el.node.style.opacity || 1),
              });
              currentY -= pdfFontSize * 1.2;
            }
          } else if (el.type === 'image') {
            let pdfImage;
            const imageType = el.file.type;
            
            if (imageType === 'image/jpeg' || imageType === 'image/jpg') {
              pdfImage = await pdfDoc.embedJpg(el.buffer);
            } else {
              pdfImage = await pdfDoc.embedPng(el.buffer);
            }
            
            page.drawImage(pdfImage, {
              x: pdfX,
              y: pdfY,
              width: uiWidth / scale,
              height: uiHeight / scale,
              rotate: degrees(Number(el.node.dataset.rotation || 0)),
              opacity: Number(el.node.style.opacity || 1),
            });
          }
        }
      }

      addResults([createBlobResult(makeOutputName(file, '-editado', 'pdf', index), new Blob([await pdfDoc.save()], { type: 'application/pdf' }))]);
    }
  }

  async function processImageBatch(files, options) {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const image = await loadImage(file);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let sx = 0;
      let sy = 0;
      let sw = image.naturalWidth;
      let sh = image.naturalHeight;
      let outW = image.naturalWidth;
      let outH = image.naturalHeight;
      let type = 'image/webp';
      let quality = Number(options.imageQuality || 0.9);
      let suffix = '-convertido';

      if (state.activeTool.id === 'image-resize') {
        outW = toNumber(options.resizeWidth, image.naturalWidth) || image.naturalWidth;
        const resizeHeight = optionalNumber(options.resizeHeight);
        if (resizeHeight) {
          outH = resizeHeight;
        } else {
          outH = Math.round(image.naturalHeight * (outW / image.naturalWidth));
        }
        type = String(options.resizeFormat || 'image/webp');
        suffix = '-redimensionado';
      }

      if (state.activeTool.id === 'image-crop') {
        const ratioParts = String(options.cropRatio || '1:1').split(':').map(Number);
        const ratio = ratioParts[0] / ratioParts[1];
        const current = image.naturalWidth / image.naturalHeight;
        if (current > ratio) {
          sw = image.naturalHeight * ratio;
          sx = (image.naturalWidth - sw) / 2;
        } else {
          sh = image.naturalWidth / ratio;
          sy = (image.naturalHeight - sh) / 2;
        }
        outW = Math.round(sw);
        outH = Math.round(sh);
        type = String(options.cropFormat || 'image/webp');
        suffix = '-recortado';
      }

      if (state.activeTool.id === 'image-watermark') {
        type = String(options.imageWatermarkFormat || 'image/webp');
        suffix = '-marca-agua';
      }

      if (state.activeTool.id === 'image-bg-remove') {
        type = 'image/png';
        suffix = '-sem-fundo';
      }

      if (state.activeTool.id === 'image-convert') {
        type = String(options.imageFormat || 'image/webp');
        suffix = '-convertido';
      }

      if (state.activeTool.id === 'image-compress') {
        type = String(options.imageCompressFormat || 'image/jpeg');
        quality = Number(options.imageCompressQuality || 0.7);
        suffix = '-comprimido';
      }

      if (state.activeTool.id === 'image-enhance') {
        type = 'image/jpeg';
        suffix = '-melhorado';
      }

      canvas.width = outW;
      canvas.height = outH;
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, outW, outH);

      if (state.activeTool.id === 'image-enhance') {
        const imgData = ctx.getImageData(0, 0, outW, outH);
        enhancePixels(imgData, Number(options.enhanceSharpen || 20), Number(options.enhanceContrast || 10), Number(options.enhanceBrightness || 0));
        ctx.putImageData(imgData, 0, 0);
      }

      if (state.activeTool.id === 'image-watermark') {
        buildImageWatermark(ctx, outW, outH, options);
      }

      if (state.activeTool.id === 'image-bg-remove') {
        const mode = options.bgMode || 'flood';
        let targetColor = null;
        if (mode === 'white') {
          targetColor = { r: 255, g: 255, b: 255 };
        } else if (mode === 'black') {
          targetColor = { r: 0, g: 0, b: 0 };
        } else if (mode === 'color') {
          targetColor = hexToRgb(options.bgColor || '#ffffff');
        }
        const useFlood = mode === 'flood';

        if (index === 0 && state.bgRemove.hasEdits && state.bgRemove.maskCanvas) {
          const baseCanvas = document.createElement('canvas');
          baseCanvas.width = outW;
          baseCanvas.height = outH;
          const baseCtx = baseCanvas.getContext('2d');
          baseCtx.drawImage(image, sx, sy, sw, sh, 0, 0, outW, outH);
          applyBackgroundRemoval(baseCtx, outW, outH, Number(options.bgThreshold || 32), Number(options.bgSoftness || 15), targetColor, Number(options.bgEdgeRefine || 40), Number(options.bgDenoise || 1), useFlood);

          const origCanvas = document.createElement('canvas');
          origCanvas.width = outW;
          origCanvas.height = outH;
          const origCtx = origCanvas.getContext('2d');
          origCtx.drawImage(image, sx, sy, sw, sh, 0, 0, outW, outH);

          const baseData = baseCtx.getImageData(0, 0, outW, outH).data;
          const origData = origCtx.getImageData(0, 0, outW, outH).data;

          const maskTempCanvas = document.createElement('canvas');
          maskTempCanvas.width = outW;
          maskTempCanvas.height = outH;
          const maskTempCtx = maskTempCanvas.getContext('2d');
          maskTempCtx.drawImage(state.bgRemove.maskCanvas, 0, 0, outW, outH);
          const maskData = maskTempCtx.getImageData(0, 0, outW, outH).data;

          const outImgData = ctx.createImageData(outW, outH);
          const outData = outImgData.data;

          for (let i = 0; i < outData.length; i += 4) {
            const mx = maskData[i];
            if (mx < 64) {
              outData[i] = origData[i];
              outData[i + 1] = origData[i + 1];
              outData[i + 2] = origData[i + 2];
              outData[i + 3] = 0;
            } else if (mx > 192) {
              outData[i] = origData[i];
              outData[i + 1] = origData[i + 1];
              outData[i + 2] = origData[i + 2];
              outData[i + 3] = origData[i + 3];
            } else {
              outData[i] = baseData[i];
              outData[i + 1] = baseData[i + 1];
              outData[i + 2] = baseData[i + 2];
              outData[i + 3] = baseData[i + 3];
            }
          }
          ctx.putImageData(outImgData, 0, 0);
        } else {
          applyBackgroundRemoval(ctx, outW, outH, Number(options.bgThreshold || 32), Number(options.bgSoftness || 15), targetColor, Number(options.bgEdgeRefine || 40), Number(options.bgDenoise || 1), useFlood);
        }
      }

      const blob = await canvasToBlob(canvas, type, quality);
      setProgress(((index + 1) / files.length) * 100, 'A processar imagens', file.name);
      addResults([
        createBlobResult(makeOutputName(file, suffix, extForFormat(type), index), blob),
      ]);
    }
  }

  async function runFfmpegJob(file, outputFormat, args, mimeType, index, suffix) {
    const ffmpeg = await ensureFfmpeg();
    const inputName = sanitizeFsName(file.name) + '-' + index + '-input';
    const outputName = sanitizeFsName(file.name) + '-' + index + '-output.' + outputFormat;
    const fileData = await state.ffmpegFetchFile(file);

    ffmpeg.FS('writeFile', inputName, fileData);
    try {
      await safeRunFfmpeg(ffmpeg, ['-y', '-i', inputName].concat(args, [outputName]));
      const out = ffmpeg.FS('readFile', outputName);
      return createBlobResult(makeOutputName(file, suffix, outputFormat, index), new Blob([out], { type: mimeType }));
    } finally {
      try { ffmpeg.FS('unlink', inputName); } catch (_) {}
      try { ffmpeg.FS('unlink', outputName); } catch (_) {}
    }
  }

  async function processVideoConvert(files, options) {
    await ensureFfmpeg();
    const outputFormat = String(options.videoFormat || 'mp4');
    const crf = String(options.videoCrf || '22');
    const bitrate = String(options.audioBitrate || '192') + 'k';
    const scaleFilter = normalizeVideoScale(options);
    const fps = optionalNumber(options.videoFps);

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setProgress(((index) / files.length) * 100, 'A converter vídeo', file.name);
      const args = [];
      const filters = [];
      if (scaleFilter) filters.push(scaleFilter);
      if (fps) filters.push('fps=' + fps);
      if (filters.length) args.push('-vf', filters.join(','));

      if (outputFormat === 'webm') {
        args.push('-c:v', 'libvpx-vp9', '-crf', crf, '-b:v', '0', '-c:a', 'libopus', '-b:a', bitrate);
      } else if (outputFormat === 'mkv') {
        args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', crf, '-c:a', 'aac', '-b:a', bitrate);
      } else if (outputFormat === 'mov') {
        args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', crf, '-c:a', 'aac', '-b:a', bitrate);
      } else if (outputFormat === 'avi') {
        args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', crf, '-c:a', 'aac', '-b:a', bitrate);
      } else {
        args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', crf, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', bitrate);
      }

      const result = await runFfmpegJob(file, outputFormat, args, mimeForVideoFormat(outputFormat), index, '-convertido');
      addResults([result]);
    }
  }

  async function processVideoToMp3(files, options) {
    await ensureFfmpeg();
    const bitrate = String(options.videoMp3Bitrate || '192') + 'k';

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setProgress(((index) / files.length) * 100, 'A extrair MP3', file.name);
      const args = ['-vn', '-c:a', 'libmp3lame', '-b:a', bitrate];
      const result = await runFfmpegJob(file, 'mp3', args, 'audio/mpeg', index, '-mp3');
      addResults([result]);
    }
  }

  async function processAudioConvert(files, options) {
    await ensureFfmpeg();
    const outputFormat = String(options.audioFormat || 'mp3');
    const bitrate = String(options.audioConvertBitrate || '192') + 'k';

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setProgress(((index) / files.length) * 100, 'A converter áudio', file.name);
      const args = [];

      if (outputFormat === 'wav') {
        args.push('-c:a', 'pcm_s16le');
      } else if (outputFormat === 'ogg') {
        args.push('-c:a', 'libvorbis', '-b:a', bitrate);
      } else if (outputFormat === 'opus') {
        args.push('-c:a', 'libopus', '-b:a', bitrate);
      } else {
        args.push('-c:a', 'libmp3lame', '-b:a', bitrate);
      }

      const result = await runFfmpegJob(file, outputFormat, args, mimeForAudioFormat(outputFormat), index, '-convertido');
      addResults([result]);
    }
  }

  async function processGifEdit(files, options) {
    await ensureFfmpeg();
    const outputFormat = String(options.gifFormat || 'gif');
    const width = optionalNumber(options.gifWidth);
    const height = optionalNumber(options.gifHeight);
    const fps = optionalNumber(options.gifFps) || 15;
    const start = optionalNumber(options.gifStart);
    const duration = optionalNumber(options.gifDuration);

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setProgress(((index) / files.length) * 100, 'A editar GIF', file.name);
      const filters = [];
      if (width || height) {
        filters.push('scale=' + (width || -2) + ':' + (height || -2) + ':flags=lanczos');
      }
      filters.push('fps=' + fps);

      const args = [];
      if (filters.length) args.push('-vf', filters.join(','));
      if (start !== null && start !== undefined) args.push('-ss', String(start));
      if (duration !== null && duration !== undefined) args.push('-t', String(duration));

      if (outputFormat === 'webp') {
        args.push('-loop', '0', '-preset', 'default', '-an', '-vsync', '0');
      } else if (outputFormat === 'mp4') {
        args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an');
      } else {
        args.push('-loop', '0', '-an');
      }

      const result = await runFfmpegJob(
        file,
        outputFormat,
        args,
        outputFormat === 'mp4' ? 'video/mp4' : (outputFormat === 'webp' ? 'image/webp' : 'image/gif'),
        index,
        '-editado'
      );
      addResults([result]);
    }
  }

  async function extractInstagramViaDdInstagram(url) {
    let cleanUrl = url;
    if (cleanUrl.includes('instagram.com')) {
      cleanUrl = cleanUrl.replace('instagram.com', 'ddinstagram.com').replace('www.', '');
    }
    
    const proxyUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent(cleanUrl);
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error('CORS proxy returned status ' + response.status);
    }
    const data = await response.json();
    if (!data || !data.contents) {
      throw new Error('No contents from CORS proxy');
    }
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(data.contents, 'text/html');
    
    const ogImageMeta = doc.querySelector('meta[property="og:image"]') || doc.querySelector('meta[name="twitter:image"]');
    const ogVideoMeta = doc.querySelector('meta[property="og:video"]') || doc.querySelector('meta[name="twitter:player"]');
    
    const imageUrl = ogImageMeta ? ogImageMeta.getAttribute('content') : null;
    const videoUrl = ogVideoMeta ? ogVideoMeta.getAttribute('content') : null;
    
    if (!imageUrl && !videoUrl) {
      throw new Error('No media metadata found in ddinstagram');
    }
    
    return {
      imageUrl: imageUrl,
      videoUrl: videoUrl
    };
  }

  async function processLinkHelper(urls, options) {
    const mode = String(options.linkMode || 'auto');
    const quality = String(options.linkQuality || '720');
    const audioFormat = String(options.linkAudioFormat || 'mp3');
    const audioBitrate = String(options.linkAudioBitrate || '192');

    const results = [];
    const validUrls = urls.map(function (url) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return null;
        }
        return parsed.toString();
      } catch (_) {
        return null;
      }
    }).filter(Boolean);

    if (!validUrls.length) {
      throw new Error('Adiciona ligações válidas com http ou https.');
    }

    for (let index = 0; index < validUrls.length; index += 1) {
      const url = validUrls[index];
      setProgress((index / validUrls.length) * 100, 'A processar link', url);

      if (isDirectMediaUrl(url)) {
        const filename = getFilenameFromUrl(url);
        try {
          const directRes = await fetch(url);
          if (directRes.ok) {
            const blob = await directRes.blob();
            results.push(createBlobResult(filename, blob));
            continue;
          }
          throw new Error('Status: ' + directRes.status);
        } catch (directErr) {
          console.warn('Direct media fetch failed, using fallback:', directErr);
          results.push({
            name: filename,
            href: url,
            download: true,
            meta: 'Link Direto (Sem CORS, clique para abrir/descarregar)'
          });
          continue;
        }
      }

      const apiPool = [];
      apiPool.push('https://api.cobalt.tools/');

      dynamicFallbackApis.forEach(function (mirror) {
        if (!apiPool.includes(mirror)) {
          apiPool.push(mirror);
        }
      });

      DEFAULT_FALLBACK_APIS.forEach(function (mirror) {
        if (!apiPool.includes(mirror)) {
          apiPool.push(mirror);
        }
      });

      let success = false;
      let lastErrorMsg = '';

      // TIKTOK TIKWM API FALLBACK
      if (url.indexOf('tiktok.com') !== -1) {
        try {
          setProgress(
            (index / validUrls.length) * 100,
            'A processar link',
            url + ' (tentando API TikWM)'
          );
          const response = await fetch('https://www.tikwm.com/api/', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'url=' + encodeURIComponent(url) + '&hd=1'
          });
          if (response.ok) {
            const data = await response.json();
            if (data && data.code === 0 && data.data) {
              const isAudio = mode === 'audio';
              const mediaUrl = isAudio ? data.data.music : (data.data.hdplay || data.data.play);
              if (mediaUrl) {
                results.push({
                  name: (data.data.id || ('tiktok-' + (index + 1))) + (isAudio ? '.mp3' : '.mp4'),
                  href: mediaUrl,
                  download: true,
                  meta: 'TikTok Downloader (TikWM API) · ' + (isAudio ? 'Apenas Áudio' : 'Vídeo HD')
                });
                success = true;
              }
            }
          }
        } catch (err) {
          console.warn('Falha na API TikWM:', err);
        }
      }

      // YOUTUBE INVIDIOUS API FALLBACK
      if (!success && (url.indexOf('youtube.com') !== -1 || url.indexOf('youtu.be') !== -1)) {
        const extractYoutubeId = function(u) {
          try {
            const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
            const match = u.match(regExp);
            return (match && match[2].length === 11) ? match[2] : null;
          } catch (_) {
            return null;
          }
        };

        const ytId = extractYoutubeId(url);
        if (ytId) {
          const INVIDIOUS_INSTANCES = [
            'https://invidious.yewtu.be',
            'https://vid.puffyan.us',
            'https://inv.tux.im',
            'https://invidious.projectsegfau.lt',
            'https://invidious.io'
          ];

          for (let i = 0; i < INVIDIOUS_INSTANCES.length; i++) {
            const instance = INVIDIOUS_INSTANCES[i];
            try {
              setProgress(
                (index / validUrls.length) * 100,
                'A processar link',
                url + ' (tentando Invidious ' + (i + 1) + '/' + INVIDIOUS_INSTANCES.length + ')'
              );
              const res = await fetch(instance + '/api/v1/videos/' + ytId + '?local=true');
              if (res.ok) {
                const data = await res.json();
                const isAudio = mode === 'audio';
                let mediaUrl = null;
                let extension = isAudio ? 'mp3' : 'mp4';
                
                if (isAudio) {
                  const audioFormat = data.adaptiveFormats && data.adaptiveFormats.find(function(f) {
                    return f.type && f.type.indexOf('audio/') === 0;
                  });
                  if (audioFormat && audioFormat.url) {
                    mediaUrl = audioFormat.url;
                    if (audioFormat.container) extension = audioFormat.container;
                  }
                } else {
                  if (data.formatStreams && data.formatStreams.length > 0) {
                    const stream = data.formatStreams[0];
                    if (stream && stream.url) {
                      mediaUrl = stream.url;
                      if (stream.container) extension = stream.container;
                    }
                  }
                  if (!mediaUrl && data.adaptiveFormats && data.adaptiveFormats.length > 0) {
                    const videoFormat = data.adaptiveFormats.find(function(f) {
                      return f.type && f.type.indexOf('video/') === 0;
                    });
                    if (videoFormat && videoFormat.url) {
                      mediaUrl = videoFormat.url;
                      if (videoFormat.container) extension = videoFormat.container;
                    }
                  }
                }
                
                if (mediaUrl) {
                  if (mediaUrl.indexOf('/') === 0) {
                    mediaUrl = instance + mediaUrl;
                  }
                  results.push({
                    name: (data.title || 'video') + '.' + extension,
                    href: mediaUrl,
                    download: true,
                    meta: 'YouTube Downloader (Invidious API) · ' + (isAudio ? 'Apenas Áudio' : 'Qualidade Standard')
                  });
                  success = true;
                  break;
                }
              }
            } catch (err) {
              console.warn('Falha na API Invidious (' + instance + '):', err);
            }
          }
        }
      }

      // COBALT MIRROR FALLBACKS
      if (!success) {
        const apiPool = [];
        apiPool.push('https://api.cobalt.tools/');

        dynamicFallbackApis.forEach(function (mirror) {
          if (!apiPool.includes(mirror)) {
            apiPool.push(mirror);
          }
        });

        DEFAULT_FALLBACK_APIS.forEach(function (mirror) {
          if (!apiPool.includes(mirror)) {
            apiPool.push(mirror);
          }
        });

        for (let apiIndex = 0; apiIndex < apiPool.length; apiIndex += 1) {
          const currentApiUrl = apiPool[apiIndex];
          try {
            setProgress(
              (index / validUrls.length) * 100,
              'A processar link',
              url + ' (tentando servidor ' + (apiIndex + 1) + '/' + apiPool.length + ')'
            );

            const response = await fetch(currentApiUrl, {
              method: 'POST',
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                url: url,
                videoQuality: quality,
                downloadMode: mode,
                audioFormat: audioFormat,
                audioBitrate: audioBitrate,
                filenameStyle: 'basic'
              })
            });

            if (!response.ok) {
              throw new Error('Status ' + response.status);
            }

            const data = await response.json();

            if (data.status === 'error') {
              throw new Error(data.text || 'Erro retornado pela API.');
            }

            if (data.url) {
              results.push({
                name: data.filename || ('download-' + (index + 1)),
                href: data.url,
                download: true,
                meta: 'Qualidade: ' + quality + 'p · Áudio: ' + audioFormat + ' (' + audioBitrate + ' kbps)'
              });
              success = true;
              break;
            } else if (data.status === 'picker' && data.picker && data.picker.length > 0) {
              data.picker.forEach(function (item, itemIdx) {
                results.push({
                  name: item.text || ('Opção ' + (itemIdx + 1)),
                  href: item.url,
                  download: true,
                  meta: 'Modo: ' + mode
                });
              });
              success = true;
              break;
            } else {
              throw new Error('Nenhum link retornado.');
            }
          } catch (err) {
            console.warn('Falha na API Cobalt ' + currentApiUrl + ':', err);
            lastErrorMsg = err.message || '';
            setProgress(
              (index / validUrls.length) * 100,
              'A processar link',
              url + ' (servidor ' + (apiIndex + 1) + ' falhou, tentando o seguinte...)'
            );
          }
        }
      }

      // DIRECT INSTAGRAM EXTRACTION FALLBACK
      if (!success && url.indexOf('instagram.com') !== -1) {
        try {
          setProgress(
            (index / validUrls.length) * 100,
            'A processar link',
            url + ' (tentando extração direta...)'
          );
          const media = await extractInstagramViaDdInstagram(url);
          if (media.videoUrl) {
            results.push({
              name: 'instagram-video-' + (index + 1) + '.mp4',
              href: media.videoUrl,
              download: true,
              meta: 'Instagram Downloader (Direct Video)'
            });
            success = true;
          } else if (media.imageUrl) {
            results.push({
              name: 'instagram-image-' + (index + 1) + '.jpg',
              href: media.imageUrl,
              download: true,
              meta: 'Instagram Downloader (Direct Image)'
            });
            success = true;
          }
        } catch (err) {
          console.warn('Direct ddinstagram extraction failed:', err);
        }
      }

      // DOMAIN-SPECIFIC FALLBACK EXTERNAL REDIRECTS (NON-COBALT OPTION)
      if (!success) {
        let fallbackUrl = '';
        let serviceName = '';
        
        if (url.indexOf('youtube.com') !== -1 || url.indexOf('youtu.be') !== -1) {
          fallbackUrl = 'https://en.savefrom.net/?url=' + encodeURIComponent(url);
          serviceName = 'SaveFrom.net (YouTube)';
        } else if (url.indexOf('instagram.com') !== -1) {
          fallbackUrl = 'https://snapinsta.to/?url=' + encodeURIComponent(url);
          serviceName = 'SnapInsta (Instagram)';
        } else if (url.indexOf('tiktok.com') !== -1) {
          fallbackUrl = 'https://snaptik.app/';
          serviceName = 'SnapTik (TikTok)';
        } else {
          fallbackUrl = 'https://en.savefrom.net/?url=' + encodeURIComponent(url);
          serviceName = 'SaveFrom.net';
        }

        results.push({
          name: 'Ligação ' + (index + 1) + ' (Serviço Externo)',
          href: fallbackUrl,
          meta: 'Download direto indisponível. Clique para abrir no ' + serviceName + '.'
        });
      }
    }

    addResults(results);

    const allSuccessful = results.every(function (item) {
      if (!item.href) return true;
      const h = item.href;
      return h.indexOf('cobalt.tools/#') === -1 && 
             h.indexOf('savefrom.net') === -1 && 
             h.indexOf('snapinsta.to') === -1 && 
             h.indexOf('snaptik.app') === -1;
    });

    if (allSuccessful) {
      setProgress(100, 'Ligações prontas', 'Links de download gerados com sucesso.');
    } else {
      setProgress(100, 'Concluído com avisos', 'Alguns descarregamentos falharam e foram redirecionados para serviços alternativos.');
    }
  }
  async function runActiveTool() {
    const items = getInputItems();
    if (!items.length && state.activeTool.inputMode !== 'none') {
      alert(state.activeTool.inputMode === 'urls'
        ? 'Adiciona pelo menos uma ligação.'
        : 'Adiciona pelo menos um ficheiro.');
      return;
    }

    clearResults();
    setProcessing(true);
    setProgress(0, 'A iniciar', 'A preparar ficheiros.');
    setRuntimeStatus('A preparar...');

    try {
      if (state.activeTool.inputMode === 'urls') {
        const options = getOptions();
        const links = parseLinks();
        if (!links.length) {
          throw new Error('Adiciona pelo menos uma ligação válida.');
        }
        await state.activeTool.processor(links, options);
      } else {
        const options = getOptions();
        await state.activeTool.processor(state.files.slice(), options);
      }

      setProgress(100, 'Concluído', 'Resultados prontos para download.');
      setRuntimeStatus('Pronto para processar');
    } catch (error) {
      console.error(error);
      setProgress(100, 'Erro', error.message || 'Não foi possível processar.');
      setRuntimeStatus('Erro no processamento');
    } finally {
      setProcessing(false);
      renderResults();
      updateCounters();
    }
  }

  async function downloadAll() {
    if (!window.JSZip) return;
    const downloadable = state.results.filter(function (item) {
      return !!item.blob;
    });
    if (!downloadable.length) return;

    if (downloadable.length === 1) {
      const single = downloadable[0];
      const link = document.createElement('a');
      link.href = single.url;
      link.download = single.name;
      link.click();
      return;
    }

    const zip = new window.JSZip();
    downloadable.forEach(function (result) {
      zip.file(result.name, result.blob);
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'resultados-estudio.zip';
    link.click();
    URL.revokeObjectURL(url);
  }

  function closeMenus() {
    if (refs.navBurger) {
      refs.navBurger.setAttribute('aria-expanded', 'false');
    }
    if (document.body) {
      document.body.classList.remove('nav-open');
    }
  }

  function setActiveTool(toolId) {
    const tool = toolMap[toolId];
    if (!tool) return;
    const previousCount = state.files.length;
    state.activeTool = tool;
    state.activeGroup = tool.group;
    if (tool.inputMode === 'urls') {
      state.files = [];
    } else if (refs.linkInput) {
      refs.linkInput.value = '';
      if (state.files.length) {
        state.files = state.files.filter(function (file) {
          return matchesAccept(file, tool.accept);
        });
      }
    }

    const removedCount = previousCount - state.files.length;
    if (removedCount > 0 && tool.inputMode !== 'urls') {
      setRuntimeStatus('Ficheiros incompatíveis removidos');
    }

    updateActiveChrome();
    renderToolPicker();
    renderToolRail();
    renderToolOptions();
    renderInputs();
    updateCounters();
    setRuntimeStatus(tool.kind === 'ffmpeg'
      ? 'Conversor de vídeo sob pedido'
      : (tool.kind.indexOf('pdf') === 0 ? 'Módulo PDF sob pedido' : 'Ferramentas locais sob pedido'));
  }

  function bindEvents() {
    // Bind new tool-type menu (grouped multi-level dropdown)
    document.addEventListener('click', function (e) {
      // Handle tool option selection
      var toolOption = e.target.closest('.tool-type-option[data-tool]');
      if (toolOption) {
        setActiveTool(toolOption.dataset.tool);
        return;
      }

      // Handle type category button click (switch active group and set active tool to first in that group)
      var trigger = e.target.closest('[data-type-trigger]');
      if (trigger) {
        var groupName = trigger.dataset.typeTrigger;
        var groupTools = tools.filter(function (t) { return t.group === groupName; });
        if (groupTools.length > 0) {
          setActiveTool(groupTools[0].id);
        }
        return;
      }
    });



    refs.heroPickFilesBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      state.uploadMode = 'files';
      refs.heroPickFilesBtn.className = 'btn btn--primary btn--sm';
      refs.heroPickFolderBtn.className = 'btn btn--outline btn--sm';
    });

    refs.heroPickFolderBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      state.uploadMode = 'folder';
      refs.heroPickFilesBtn.className = 'btn btn--outline btn--sm';
      refs.heroPickFolderBtn.className = 'btn btn--primary btn--sm';
    });


    refs.fileInput.addEventListener('change', function () {
      addFiles(refs.fileInput.files);
      refs.fileInput.value = '';
    });

    refs.folderInput.addEventListener('change', function () {
      addFiles(refs.folderInput.files);
      refs.folderInput.value = '';
    });
    

    if (refs.visualEditorPage) {
      refs.visualEditorPage.addEventListener('change', function () {
        state.visualEditor.pageIndex = Number(refs.visualEditorPage.value);
        renderVisualEditorPage();
      });
    }
    if (refs.visualAddTextBtn) {
      refs.visualAddTextBtn.addEventListener('click', addVisualText);
    }
    if (refs.visualAddImageBtn) {
      refs.visualAddImageBtn.addEventListener('click', function () {
        refs.visualAddImageInput.click();
      });
    }
    if (refs.visualAddImageInput) {
      refs.visualAddImageInput.addEventListener('change', function () {
        if (refs.visualAddImageInput.files && refs.visualAddImageInput.files.length > 0) {
          addVisualImage(refs.visualAddImageInput.files[0]);
          refs.visualAddImageInput.value = '';
        }
      });
    }
    if (refs.visualTextColor) {
      refs.visualTextColor.addEventListener('input', function () {
        const el = state.visualEditor.activeElement;
        if (el && el.type === 'text') {
          el.node.style.color = refs.visualTextColor.value;
        }
        const sel = window.getSelection();
        if (sel.rangeCount > 0 && sel.focusNode) {
          const p = sel.focusNode.parentNode;
          if (p.contentEditable === 'true') {
            p.style.color = refs.visualTextColor.value;
          }
        }
      });
    }
    if (refs.visualTextSize) {
      refs.visualTextSize.addEventListener('input', function () {
        const el = state.visualEditor.activeElement;
        if (el && el.type === 'text') {
          el.node.style.fontSize = refs.visualTextSize.value + 'px';
        }
        const sel = window.getSelection();
        if (sel.rangeCount > 0 && sel.focusNode) {
          const p = sel.focusNode.parentNode;
          if (p.contentEditable === 'true') {
            p.style.fontSize = refs.visualTextSize.value + 'px';
          }
        }
      });
    }
    if (refs.visualElementRotation) {
      refs.visualElementRotation.addEventListener('input', function () {
        const el = state.visualEditor.activeElement;
        if (el) {
          const val = refs.visualElementRotation.value;
          el.node.dataset.rotation = val;
          el.node.style.transform = 'rotate(' + val + 'deg)';
        }
      });
    }
    if (refs.visualElementOpacity) {
      refs.visualElementOpacity.addEventListener('input', function () {
        const el = state.visualEditor.activeElement;
        if (el) {
          el.node.style.opacity = refs.visualElementOpacity.value;
        }
      });
    }
    if (refs.visualRepeatBtn) {
      refs.visualRepeatBtn.addEventListener('click', repeatActiveElementOnAllPages);
    }
    if (refs.imageAddTextBtn) {
      refs.imageAddTextBtn.addEventListener('click', addImageWatermarkText);
    }
    if (refs.imageAddImageBtn) {
      refs.imageAddImageBtn.addEventListener('click', function () {
        refs.imageAddImageInput.click();
      });
    }
    if (refs.imageAddImageInput) {
      refs.imageAddImageInput.addEventListener('change', function () {
        if (refs.imageAddImageInput.files && refs.imageAddImageInput.files.length > 0) {
          addImageWatermarkImage(refs.imageAddImageInput.files[0]);
          refs.imageAddImageInput.value = '';
        }
      });
    }
    if (refs.imageTextColor) {
      refs.imageTextColor.addEventListener('input', function () {
        const el = state.imageWatermark.activeElement;
        if (el && el.type === 'text') {
          el.node.style.color = refs.imageTextColor.value;
        }
        const sel = window.getSelection();
        if (sel.rangeCount > 0 && sel.focusNode) {
          const p = sel.focusNode.parentNode;
          if (p.contentEditable === 'true') {
            p.style.color = refs.imageTextColor.value;
          }
        }
      });
    }
    if (refs.imageTextSize) {
      refs.imageTextSize.addEventListener('input', function () {
        const el = state.imageWatermark.activeElement;
        if (el && el.type === 'text') {
          el.node.style.fontSize = refs.imageTextSize.value + 'px';
        }
        const sel = window.getSelection();
        if (sel.rangeCount > 0 && sel.focusNode) {
          const p = sel.focusNode.parentNode;
          if (p.contentEditable === 'true') {
            p.style.fontSize = refs.imageTextSize.value + 'px';
          }
        }
      });
    }
    if (refs.imageElementRotation) {
      refs.imageElementRotation.addEventListener('input', function () {
        const el = state.imageWatermark.activeElement;
        if (el) {
          const val = refs.imageElementRotation.value;
          el.node.dataset.rotation = val;
          el.node.style.transform = 'rotate(' + val + 'deg)';
        }
      });
    }
    if (refs.imageElementOpacity) {
      refs.imageElementOpacity.addEventListener('input', function () {
        const el = state.imageWatermark.activeElement;
        if (el) {
          el.node.style.opacity = refs.imageElementOpacity.value;
        }
      });
    }

    refs.linkInput.addEventListener('input', function () {
      renderInputs();
      updateCounters();
    });

    const handleOptionChange = function () {
      if (state.activeTool && state.activeTool.id === 'image-bg-remove') {
        state.bgRemove.baseNeedsUpdate = true;
        renderImageBgRemovePreview();
      }
    };

    refs.toolOptions.addEventListener('input', function (event) {
      const range = event.target.closest('input[type="range"]');
      if (range) {
        const valueNode = refs.toolOptions.querySelector('[data-option-value="' + range.id + '"]');
        if (valueNode) valueNode.textContent = range.value;
      }
      updateCounters();
      handleOptionChange();
    });

    refs.toolOptions.addEventListener('change', handleOptionChange);

    const brushModeSelect = document.getElementById('bgRemoveBrushMode');
    if (brushModeSelect) {
      brushModeSelect.addEventListener('change', function () {
        updateBgRemoveControlsUI();
        renderImageBgRemovePreview();
      });
    }

    const brushSizeInput = document.getElementById('bgRemoveBrushSize');
    if (brushSizeInput) {
      brushSizeInput.addEventListener('input', function () {
        const valSpan = document.getElementById('bgRemoveBrushSizeVal');
        if (valSpan) valSpan.textContent = brushSizeInput.value + 'px';
        renderImageBgRemovePreview();
      });
    }

    const clearEditsBtn = document.getElementById('bgRemoveClearEdits');
    if (clearEditsBtn) {
      clearEditsBtn.addEventListener('click', function () {
        clearBgRemoveEdits();
      });
    }

    if (refs.imageBgRemoveCanvas) {
      refs.imageBgRemoveCanvas.addEventListener('mousedown', function (event) {
        if (!state.bgRemove.image) return;
        const brushMode = state.bgRemove.brushMode || 'select-color';
        if (brushMode === 'erase' || brushMode === 'restore') {
          state.bgRemove.isDrawing = true;
          drawBrush(event, true);
        } else {
          // Select color mode
          const canvas = refs.imageBgRemoveCanvas;
          const rect = canvas.getBoundingClientRect();
          const x = Math.floor((event.clientX - rect.left) * (canvas.width / rect.width));
          const y = Math.floor((event.clientY - rect.top) * (canvas.height / rect.height));

          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = canvas.width;
          tempCanvas.height = canvas.height;
          const tempCtx = tempCanvas.getContext('2d');
          tempCtx.drawImage(state.bgRemove.image, 0, 0, tempCanvas.width, tempCanvas.height);

          const pixel = tempCtx.getImageData(x, y, 1, 1).data;
          const r = pixel[0];
          const g = pixel[1];
          const b = pixel[2];

          const rgbToHex = function (rVal, gVal, bVal) {
            const toHex = function (c) {
              const hex = c.toString(16);
              return hex.length === 1 ? '0' + hex : hex;
            };
            return '#' + toHex(rVal) + toHex(gVal) + toHex(bVal);
          };

          const hexColor = rgbToHex(r, g, b);

          const bgColorInput = document.getElementById('bgColor');
          if (bgColorInput) {
            bgColorInput.value = hexColor;
          }
          const bgModeSelect = document.getElementById('bgMode');
          if (bgModeSelect) {
            bgModeSelect.value = 'color';
          }

          state.bgRemove.baseNeedsUpdate = true;
          renderImageBgRemovePreview();
        }
      });

      refs.imageBgRemoveCanvas.addEventListener('mousemove', handleBgRemoveMouseMove);
      refs.imageBgRemoveCanvas.addEventListener('mouseup', function () {
        state.bgRemove.isDrawing = false;
        state.bgRemove.lastX = undefined;
        state.bgRemove.lastY = undefined;
      });
      refs.imageBgRemoveCanvas.addEventListener('mouseleave', handleBgRemoveMouseLeave);
    }

    refs.dropZone.addEventListener('dragenter', function (event) {
      event.preventDefault();
      refs.dropZone.classList.add('drop-zone--over');
    });
    refs.dropZone.addEventListener('dragover', function (event) {
      event.preventDefault();
      refs.dropZone.classList.add('drop-zone--over');
    });
    refs.dropZone.addEventListener('dragleave', function (event) {
      event.preventDefault();
      refs.dropZone.classList.remove('drop-zone--over');
    });
    refs.dropZone.addEventListener('drop', function (event) {
      event.preventDefault();
      refs.dropZone.classList.remove('drop-zone--over');
      if (state.activeTool.inputMode === 'urls') return;
      addFiles(event.dataTransfer.files);
    });

    refs.dropZone.addEventListener('click', function (event) {
      if (state.activeTool.inputMode === 'urls') return;
      if (event.target.closest('.drop-zone__actions')) return;
      if (state.uploadMode === 'folder') {
        if (refs.folderInput) refs.folderInput.click();
      } else {
        if (refs.fileInput) refs.fileInput.click();
      }
    });

    refs.inputList.addEventListener('click', function (event) {
      const removeFileButton = event.target.closest('[data-remove-file]');
      if (removeFileButton) {
        removeFileAt(Number(removeFileButton.dataset.removeFile));
      }
    });

    refs.resultsList.addEventListener('click', function (event) {
      const removeResultButton = event.target.closest('[data-remove-result]');
      if (removeResultButton) {
        removeResultAt(Number(removeResultButton.dataset.removeResult));
      }
    });

    refs.runToolBtn.addEventListener('click', runActiveTool);
    refs.downloadAllBtn.addEventListener('click', downloadAll);
    refs.clearAllBtn.addEventListener('click', function () {
      clearInputs();
      clearResults();
      setProgress(0, 'Pronto para processar', 'Aguardando ação.');
      setRuntimeStatus('Ferramentas locais sob pedido');
    });

    document.addEventListener('click', function (event) {
      if (!event.target.closest('.nav')) {
        closeMenus();
      }
    });

    if (refs.navBurger) {
      refs.navBurger.addEventListener('click', function () {
        const open = refs.navBurger.getAttribute('aria-expanded') === 'true';
        refs.navBurger.setAttribute('aria-expanded', open ? 'false' : 'true');
        document.body.classList.toggle('nav-open', !open);
      });
    }



    document.addEventListener('paste', function (event) {
      if (state.activeTool && state.activeTool.inputMode === 'urls') return;
      if (event.clipboardData && event.clipboardData.files && event.clipboardData.files.length > 0) {
        addFiles(event.clipboardData.files);
        event.preventDefault();
      }
    });
  }

  function enhancePixels(imageData, sharpenAmt, contrastVal, brightnessVal) {
    const data = imageData.data;
    const w = imageData.width;
    const h = imageData.height;
    const factor = (259 * (contrastVal + 255)) / (255 * (259 - contrastVal));
    const original = new Uint8ClampedArray(data);
    
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          let val = original[idx + c];
          if (sharpenAmt > 0 && x > 0 && x < w - 1 && y > 0 && y < h - 1) {
            const center = original[idx + c];
            const top = original[((y - 1) * w + x) * 4 + c];
            const bottom = original[((y + 1) * w + x) * 4 + c];
            const left = original[(y * w + (x - 1)) * 4 + c];
            const right = original[(y * w + (x + 1)) * 4 + c];
            const k = sharpenAmt / 100;
            val = center * (1 + 4 * k) - k * (top + bottom + left + right);
          }
          val += brightnessVal;
          val = factor * (val - 128) + 128;
          data[idx + c] = Math.max(0, Math.min(255, val));
        }
      }
    }
  }

  async function processPdfCompress(files, options) {
    const { PDFDocument } = await ensurePdfLib();
    const pdfjs = await ensurePdfJs();
    const qualityMode = options.pdfCompressQuality || 'medium';
    
    let scale = 1.3;
    let quality = 0.7;
    if (qualityMode === 'low') {
      scale = 1.0;
      quality = 0.55;
    } else if (qualityMode === 'high') {
      scale = 1.6;
      quality = 0.85;
    }

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setProgress((index / files.length) * 100, 'A comprimir PDF', file.name);
      const srcBytes = new Uint8Array(await file.arrayBuffer());
      const srcPdf = await pdfjs.getDocument({ data: srcBytes }).promise;
      const outPdf = await PDFDocument.create();

      for (let pageIndex = 1; pageIndex <= srcPdf.numPages; pageIndex += 1) {
        const page = await srcPdf.getPage(pageIndex);
        const viewport = page.getViewport({ scale: scale });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { alpha: false });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        const jpgBlob = await canvasToBlob(canvas, 'image/jpeg', quality);
        const jpgBuffer = await jpgBlob.arrayBuffer();
        const image = await outPdf.embedJpg(jpgBuffer);
        const pdfPage = outPdf.addPage([viewport.width / scale, viewport.height / scale]);
        pdfPage.drawImage(image, {
          x: 0,
          y: 0,
          width: viewport.width / scale,
          height: viewport.height / scale,
        });
        setProgress(((index + (pageIndex / srcPdf.numPages)) / files.length) * 100, 'A comprimir PDF', file.name + ' · página ' + pageIndex);
      }

      const bytesOut = await outPdf.save();
      addResults([createBlobResult(makeOutputName(file, '-comprimido', 'pdf', index), new Blob([bytesOut], { type: 'application/pdf' }))]);
    }
  }

  async function processPdfToPptx(files, options) {
    const PptxGen = await ensurePptxGen();
    const pdfjs = await ensurePdfJs();
    const scale = Number(options.pdfToPptxScale || 1.5);

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setProgress((index / files.length) * 100, 'A converter para PPTX', file.name);
      
      const srcBytes = new Uint8Array(await file.arrayBuffer());
      const srcPdf = await pdfjs.getDocument({ data: srcBytes }).promise;
      
      const pptx = new PptxGen();
      pptx.layout = 'LAYOUT_16x9';

      for (let pageIndex = 1; pageIndex <= srcPdf.numPages; pageIndex += 1) {
        const page = await srcPdf.getPage(pageIndex);
        const viewport = page.getViewport({ scale: scale });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { alpha: false });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        
        const slide = pptx.addSlide();
        slide.background = { data: dataUrl };
        
        setProgress(((index + (pageIndex / srcPdf.numPages)) / files.length) * 100, 'A converter para PPTX', file.name + ' · diapositivo ' + pageIndex);
      }

      const pptxBlob = await pptx.write('blob');
      addResults([createBlobResult(makeOutputName(file, '', 'pptx', index), pptxBlob)]);
    }
  }

  async function processPdfToWord(files) {
    const docxLib = await ensureDocx();
    const pdfjs = await ensurePdfJs();
    const { Document, Paragraph, TextRun, Packer } = docxLib;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setProgress((index / files.length) * 100, 'A exportar para Word', file.name);
      
      const srcBytes = new Uint8Array(await file.arrayBuffer());
      const srcPdf = await pdfjs.getDocument({ data: srcBytes }).promise;
      
      const paragraphs = [];

      for (let pageIndex = 1; pageIndex <= srcPdf.numPages; pageIndex += 1) {
        const page = await srcPdf.getPage(pageIndex);
        const textContent = await page.getTextContent();
        
        const lineMap = {};
        textContent.items.forEach(function (item) {
          const y = Math.round(item.transform[5] * 2) / 2;
          if (!lineMap[y]) lineMap[y] = [];
          lineMap[y].push(item);
        });
        
        const ys = Object.keys(lineMap).map(Number).sort(function (a, b) { return b - a; });
        ys.forEach(function (y) {
          const items = lineMap[y].sort(function (a, b) { return a.transform[4] - b.transform[4]; });
          const lineStr = items.map(function (item) { return item.str; }).join(' ');
          if (lineStr.trim()) {
            paragraphs.push(new Paragraph({
              children: [new TextRun({ text: lineStr, font: 'Arial' })]
            }));
          }
        });
        
        if (pageIndex < srcPdf.numPages) {
          paragraphs.push(new Paragraph({
            children: [new TextRun({ text: '', break: 1 })]
          }));
        }
        
        setProgress(((index + (pageIndex / srcPdf.numPages)) / files.length) * 100, 'A exportar para Word', file.name + ' · página ' + pageIndex);
      }

      const doc = new Document({
        sections: [{
          properties: {},
          children: paragraphs.length ? paragraphs : [new Paragraph('Documento vazio.')]
        }]
      });

      const docxBlob = await Packer.toBlob(doc);
      addResults([createBlobResult(makeOutputName(file, '', 'docx', index), docxBlob)]);
    }
  }

  async function processImageToSvg(files, options) {
    const ImageTracer = await ensureImageTracer();
    const colors = Number(options.svgColors || 16);

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setProgress((index / files.length) * 100, 'A vetorizar imagem', file.name);
      
      const image = await loadImage(file);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      ctx.drawImage(image, 0, 0);
      
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const svgString = ImageTracer.imagedataToSVG(imgData, { 
        numberofcolors: colors,
        viewbox: true
      });
      
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
      addResults([
        createBlobResult(makeOutputName(file, '-vetor', 'svg', index), svgBlob)
      ]);
    }
  }

  async function processVideoCompress(files, options) {
    await ensureFfmpeg();
    const scalePercent = Number(options.videoCompressScale || 75);
    const crf = String(options.videoCompressCrf || '28');
    const vf = scalePercent < 100 ? 'scale=iw*' + (scalePercent/100) + ':ih*' + (scalePercent/100) + ':flags=lanczos' : '';

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setProgress(((index) / files.length) * 100, 'A comprimir vídeo', file.name);
      
      const args = [];
      if (vf) {
        args.push('-vf', vf);
      }
      args.push('-c:v', 'libx264', '-crf', crf, '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'copy');
      
      const result = await runFfmpegJob(file, 'mp4', args, 'video/mp4', index, '-comprimido');
      addResults([result]);
    }
  }

  async function processVideoMerge(files) {
    const ffmpeg = await ensureFfmpeg();
    setProgress(0, 'A juntar vídeos', 'A preparar ficheiros...');
    
    const inputNames = [];
    let txtContent = '';
    
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const inputName = 'input_' + index + '_' + sanitizeFsName(file.name);
      const fileData = await state.ffmpegFetchFile(file);
      ffmpeg.FS('writeFile', inputName, fileData);
      inputNames.push(inputName);
      txtContent += "file '" + inputName + "'\n";
    }
    
    ffmpeg.FS('writeFile', 'inputs.txt', new TextEncoder().encode(txtContent));
    
    const outputName = 'merged_video.mp4';
    setProgress(50, 'A juntar vídeos', 'A concatenar...');
    
    try {
      await safeRunFfmpeg(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', 'inputs.txt', '-c', 'copy', outputName]);
      const out = ffmpeg.FS('readFile', outputName);
      
      addResults([
        createBlobResult('videos-juntos.mp4', new Blob([out], { type: 'video/mp4' }))
      ]);
    } finally {
      try { ffmpeg.FS('unlink', 'inputs.txt'); } catch (_) {}
      inputNames.forEach(function (name) {
        try { ffmpeg.FS('unlink', name); } catch (_) {}
      });
      try { ffmpeg.FS('unlink', outputName); } catch (_) {}
    }
  }

  let transformersPromise = null;
  async function ensureTransformers() {
    if (transformersPromise) return transformersPromise;
    transformersPromise = (async function () {
      const mod = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
      mod.env.allowLocalModels = false;
      mod.env.backends.onnx.wasm.numThreads = 1;
      return mod;
    }());
    return transformersPromise;
  }

  function parseWavToFloat32(wavBytes) {
    const view = new DataView(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);
    let offset = 12;
    while (offset < wavBytes.byteLength - 8) {
      const chunkId = String.fromCharCode(wavBytes[offset], wavBytes[offset+1], wavBytes[offset+2], wavBytes[offset+3]);
      const chunkSize = view.getUint32(offset + 4, true);
      if (chunkId === 'data') {
        const audioDataStart = offset + 8;
        const numSamples = Math.floor(chunkSize / 2);
        const float32 = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
          const sample = view.getInt16(audioDataStart + i * 2, true);
          float32[i] = sample / 32768.0;
        }
        return float32;
      }
      offset += 8 + chunkSize;
    }
    const fallbackStart = 44;
    const numSamples = Math.floor((wavBytes.byteLength - fallbackStart) / 2);
    const float32 = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      const sample = view.getInt16(fallbackStart + i * 2, true);
      float32[i] = sample / 32768.0;
    }
    return float32;
  }

  async function processVideoSubtitle(files, options) {
    const mode = String(options.subtitleMode || 'srt');
    const srtFile = options.subtitleFile;
    
    if (mode === 'srt' && !srtFile) {
      throw new Error('Por favor, carregue um ficheiro SRT para legendar.');
    }
    
    let cues = [];
    if (mode === 'srt') {
      const text = await srtFile.text();
      cues = parseSRT(text);
    } else {
      setProgress(5, 'A iniciar transcrição', 'A carregar módulo de IA...');
      const transformers = await ensureTransformers();
      
      const modelName = options.subtitleModel || 'Xenova/whisper-base';
      setProgress(8, 'A carregar modelo', 'A preparar o modelo ' + modelName + '...');
      
      const transcriber = await transformers.pipeline('automatic-speech-recognition', modelName, {
        progress_callback: (data) => {
          if (data.status === 'initiate') {
            setProgress(8, 'A carregar IA', 'A inicializar: ' + data.file);
          } else if (data.status === 'progress') {
            const p = Math.round(data.progress * 0.27) + 8;
            setProgress(p, 'A transferir modelo', 'Ficheiro: ' + data.file + ' (' + Math.round(data.progress) + '%)');
          } else if (data.status === 'done') {
            setProgress(35, 'A carregar modelo', 'Transferência concluída: ' + data.file);
          } else if (data.status === 'ready') {
            setProgress(36, 'A inicializar IA', 'Preparação e compilação do modelo...');
          }
        }
      });

      const file = files[0];
      setProgress(38, 'A processar áudio', 'A extrair faixa de áudio...');
      const ffmpeg = await ensureFfmpeg();
      const inputName = 'audio_extract_input';
      const outputName = 'audio_extract_output.wav';
      const fileData = await state.ffmpegFetchFile(file);
      ffmpeg.FS('writeFile', inputName, fileData);

      try {
        await safeRunFfmpeg(ffmpeg, ['-y', '-i', inputName, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', outputName]);
        const wavBytes = ffmpeg.FS('readFile', outputName);
        const float32Audio = parseWavToFloat32(wavBytes);

        setProgress(40, 'A transcrever', 'A analisar vozes no vídeo...');
        const result = await transcriber(float32Audio, { 
          chunk_length_s: 30,
          return_timestamps: true,
          language: 'portuguese',
          task: 'transcribe'
        });

        if (result && result.chunks) {
          cues = result.chunks.map(function (chunk) {
            return {
              start: chunk.timestamp[0] !== null ? chunk.timestamp[0] : 0,
              end: chunk.timestamp[1] !== null ? chunk.timestamp[1] : (chunk.timestamp[0] || 0) + 2,
              text: chunk.text.trim()
            };
          });
        }
      } finally {
        try { ffmpeg.FS('unlink', inputName); } catch (_) {}
        try { ffmpeg.FS('unlink', outputName); } catch (_) {}
      }
    }
    
    if (!cues.length) {
      throw new Error('Nenhuma legenda válida encontrada.');
    }
    
    const ffmpeg = await ensureFfmpeg();
    setProgress(75, 'A descarregar tipo de letra', 'A obter Roboto-Medium.ttf...');
    try {
      const fontRes = await fetch('https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-500-normal.ttf');
      if (fontRes.ok) {
        const fontData = new Uint8Array(await fontRes.arrayBuffer());
        ffmpeg.FS('writeFile', 'Roboto.ttf', fontData);
      }
    } catch (err) {
      console.warn('Não foi possível obter fonte Roboto:', err);
    }
    
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const p = Math.round((index / files.length) * 18) + 80;
      setProgress(p, 'A queimar legendas', file.name);
      
      const inputName = 'video_sub_' + index + '_input';
      const outputName = 'video_sub_' + index + '_output.mp4';
      const fileData = await state.ffmpegFetchFile(file);
      ffmpeg.FS('writeFile', inputName, fileData);
      
      const filterCues = [];
      cues.forEach(function (cue, cueIdx) {
        const cueFilename = 'cue_' + cueIdx + '.txt';
        const cleanText = cue.text.replace(/\r?\n/g, ' ').replace(/'/g, "'\\''");
        ffmpeg.FS('writeFile', cueFilename, new TextEncoder().encode(cleanText));
        
        let fontParam = '';
        try {
          ffmpeg.FS('stat', 'Roboto.ttf');
          fontParam = 'fontfile=Roboto.ttf:';
        } catch (_) {}
        
        filterCues.push(
          "drawtext=" + fontParam + "textfile=" + cueFilename + 
          ":x=(w-text_w)/2:y=h-80:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.55:enable='between(t," + 
          cue.start + "," + cue.end + ")'"
        );
      });
      
      const args = ['-vf', filterCues.join(',')];
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'copy');
      
      try {
        await safeRunFfmpeg(ffmpeg, ['-y', '-i', inputName].concat(args, [outputName]));
        const out = ffmpeg.FS('readFile', outputName);
        
        addResults([
          createBlobResult(makeOutputName(file, '-legendado', 'mp4', index), new Blob([out], { type: 'video/mp4' }))
        ]);
      } finally {
        try { ffmpeg.FS('unlink', inputName); } catch (_) {}
        try { ffmpeg.FS('unlink', outputName); } catch (_) {}
        cues.forEach(function (_, cueIdx) {
          try { ffmpeg.FS('unlink', 'cue_' + cueIdx + '.txt'); } catch (_) {}
        });
      }
    }
  }

  async function shortenUrl(longUrl) {
    try {
      const res = await fetch('https://is.gd/create.php?format=json&url=' + encodeURIComponent(longUrl));
      if (res.ok) {
        const data = await res.json();
        if (data.shorturl) return data.shorturl;
      }
    } catch (err) {
      console.warn('is.gd failed, trying alternative:', err);
    }
    try {
      const res = await fetch('https://tinyurl.com/api-create.php?url=' + encodeURIComponent(longUrl));
      if (res.ok) {
        const text = await res.text();
        if (text && text.startsWith('http')) return text.trim();
      }
    } catch (err) {
      console.warn('tinyurl failed too:', err);
    }
    return longUrl;
  }

  async function processLinkShortenQr(urls, options) {
    const QRCodeClass = await ensureQrCode();
    const logoFile = options.qrLogo;
    const colorDark = options.qrColor || '#000000';
    const colorLight = options.qrBgColor || '#ffffff';
    const size = Number(options.qrSize || 256);
    
    for (let index = 0; index < urls.length; index += 1) {
      const url = urls[index];
      setProgress((index / urls.length) * 100, 'A encurtar link', url);
      
      const shortUrl = await shortenUrl(url);
      
      const container = document.createElement('div');
      new QRCodeClass(container, {
        text: shortUrl,
        width: size,
        height: size,
        colorDark: colorDark,
        colorLight: colorLight,
        correctLevel: QRCodeClass.CorrectLevel.H
      });
      
      await new Promise(function (resolve) { setTimeout(resolve, 50); });
      
      const canvas = container.querySelector('canvas');
      if (!canvas) {
        throw new Error('Erro ao gerar o canvas do QR Code.');
      }
      
      if (logoFile) {
        const logoImg = await loadImage(logoFile);
        const ctx = canvas.getContext('2d');
        const logoSize = size * 0.22;
        const logoX = (size - logoSize) / 2;
        const logoY = (size - logoSize) / 2;
        
        ctx.fillStyle = colorLight;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, logoSize / 2 + 4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
      }
      
      const qrBlob = await canvasToBlob(canvas, 'image/png');
      addResults([
        {
          name: 'qrcode-' + (index + 1) + '.png',
          blob: qrBlob,
          url: URL.createObjectURL(qrBlob),
          meta: 'Link encurtado: ' + shortUrl
        }
      ]);
    }
  }

  function initLanguage() {
    const LOCALE_COPY = {
      pt: {
        burgerLabel: 'Abrir menu',
        nav: {
          logoHref: '../../pt/',
          home: { label: 'Início', href: '../../pt/' },
          projects: { label: 'Projetos', href: '../../pt/projetos/' },
          curriculum: { label: 'Currículo', href: '../../pt/curriculo/' },
          tools: { label: 'Ferramentas', href: '../' },
        }
      },
      en: {
        burgerLabel: 'Open menu',
        nav: {
          logoHref: '../../en/',
          home: { label: 'Home', href: '../../en/' },
          projects: { label: 'Projects', href: '../../en/projects/' },
          curriculum: { label: 'Curriculum', href: '../../en/curriculum/' },
          tools: { label: 'Tools', href: '../' },
        }
      }
    };

    const langPtBtn = document.getElementById('scLangPt');
    const langEnBtn = document.getElementById('scLangEn');

    function updateHeaderLanguage(lang) {
      const copy = LOCALE_COPY[lang] || LOCALE_COPY.pt;
      const logo = document.getElementById('scNavLogo');
      const home = document.getElementById('scNavHome');
      const projects = document.getElementById('scNavProjects');
      const curriculum = document.getElementById('scNavCurriculum');
      const tools = document.getElementById('scNavTools');
      const burger = document.getElementById('navBurger');

      if (logo) logo.href = copy.nav.logoHref;
      if (home) {
        home.textContent = copy.nav.home.label;
        home.href = copy.nav.home.href;
      }
      if (projects) {
        projects.textContent = copy.nav.projects.label;
        projects.href = copy.nav.projects.href;
      }
      if (curriculum) {
        curriculum.textContent = copy.nav.curriculum.label;
        curriculum.href = copy.nav.curriculum.href;
      }
      if (tools) {
        tools.textContent = copy.nav.tools.label;
        tools.href = copy.nav.tools.href;
      }
      if (burger) burger.setAttribute('aria-label', copy.burgerLabel);
    }

    function updateLangButtons(lang) {
      if (langPtBtn) {
        langPtBtn.classList.toggle('nav__lang-btn--active', lang === 'pt');
        langPtBtn.setAttribute('aria-pressed', lang === 'pt' ? 'true' : 'false');
      }
      if (langEnBtn) {
        langEnBtn.classList.toggle('nav__lang-btn--active', lang === 'en');
        langEnBtn.setAttribute('aria-pressed', lang === 'en' ? 'true' : 'false');
      }
      updateHeaderLanguage(lang);
    }

    let currentLang = 'pt';
    try {
      currentLang = localStorage.getItem('lang-pref') || localStorage.getItem('secretPageLocale') || 'pt';
    } catch (_) {}

    updateLangButtons(currentLang);

    if (langPtBtn) {
      langPtBtn.addEventListener('click', () => {
        try {
          localStorage.setItem('lang-pref', 'pt');
          localStorage.setItem('secretPageLocale', 'pt');
        } catch (_) {}
        updateLangButtons('pt');
      });
    }

    if (langEnBtn) {
      langEnBtn.addEventListener('click', () => {
        try {
          localStorage.setItem('lang-pref', 'en');
          localStorage.setItem('secretPageLocale', 'en');
        } catch (_) {}
        updateLangButtons('en');
      });
    }
  }

  function init() {
    initLanguage();
    bindEvents();
    setActiveTool(tools[0].id);
    renderResults();
    setProgress(0, 'Pronto para processar', 'Aguardando ação.');
    loadDynamicCobaltInstances();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());

