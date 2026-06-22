const MAX_BODY_BYTES = 1.5 * 1024 * 1024; // 1.5MB to support attached base64 images
const MAX_QUERY_LENGTH = 500;
const MAX_HISTORY_ITEMS = 6;
const MAX_CANDIDATES = 30;
const MAX_BADGES = 5;
const MAX_ANSWER_LENGTH = 500;
const MAX_REASON_LENGTH = 320; // Increased to prevent cut off reasoning sentences
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_VISION_MODEL = 'llama-3.2-11b-vision-preview';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = getCorsOrigin(origin, env);

    if (request.method === 'OPTIONS') {
      return handleOptions(request, corsOrigin);
    }

    if (!isAllowedRoute(url.pathname)) {
      return jsonResponse({ error: 'Not found.' }, 404, corsOrigin);
    }

    if (url.pathname === '/diagnose') {
      const key = env.GEMINI_API_KEY || '';
      const diagnostics = {
        hasKey: !!key,
        length: key.length,
        prefix: key.slice(0, 8),
        suffix: key.slice(-4),
        charCodeFirst: key.length ? key.charCodeAt(0) : null,
        charCodeLast: key.length ? key.charCodeAt(key.length - 1) : null,
        model: env.GROQ_MODEL || 'default',
        visionModel: env.GROQ_VISION_MODEL || 'default',
      };
      return jsonResponse(diagnostics, 200, corsOrigin);
    }

    if (origin && !corsOrigin) {
      return jsonResponse({ error: 'Origin not allowed.' }, 403, '');
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed.' }, 405, corsOrigin);
    }

    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return jsonResponse({ error: 'Expected application/json.' }, 415, corsOrigin);
    }

    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'Payload too large.' }, 413, corsOrigin);
    }

    if (!env.GEMINI_API_KEY) {
      return jsonResponse({ error: 'Missing GEMINI_API_KEY secret.' }, 500, corsOrigin);
    }

    try {
      const payload = await request.json();
      const data = validatePayload(payload);
      const result = await requestGroq(data, env);
      return jsonResponse(result, 200, corsOrigin);
    } catch (error) {
      const status = error && typeof error.status === 'number' ? error.status : 500;
      const message = error && error.message ? error.message : 'Unexpected server error.';
      return jsonResponse({ error: message }, status, corsOrigin);
    }
  },
};

function isAllowedRoute(pathname) {
  return pathname === '/' || pathname === '/recommend' || pathname === '/diagnose';
}

function getCorsOrigin(origin, env) {
  if (!origin) return '';
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return origin;

  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return allowed.includes(origin) ? origin : '';
}

function handleOptions(request, corsOrigin) {
  if ((request.headers.get('Origin') || '') && !corsOrigin) {
    return jsonResponse({ error: 'Origin not allowed.' }, 403, '');
  }

  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders(corsOrigin),
  });
}

function buildCorsHeaders(corsOrigin) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };

  if (corsOrigin) {
    headers['Access-Control-Allow-Origin'] = corsOrigin;
  }

  return headers;
}

function jsonResponse(body, status, corsOrigin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      ...buildCorsHeaders(corsOrigin),
    },
  });
}

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function clampText(value, maxLength) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, Math.max(0, maxLength - 1)).trim() + '…';
}

function validateShortText(value, fieldName, maxLength, required) {
  const text = String(value || '').trim();

  if (!text && required) {
    throw createHttpError('Missing field: ' + fieldName + '.', 400);
  }

  return clampText(text, maxLength);
}

function validateOptionalScope(scope, fieldName) {
  if (!scope) return null;
  if (typeof scope !== 'object') {
    throw createHttpError('Invalid field: ' + fieldName + '.', 400);
  }

  const id = validateShortText(scope.id, fieldName + '.id', 120, false);
  const label = validateShortText(scope.label, fieldName + '.label', 160, false);

  if (!id && !label) return null;

  return { id, label };
}

function validateHistory(history) {
  if (!Array.isArray(history)) return [];
  if (history.length > MAX_HISTORY_ITEMS) {
    throw createHttpError('History is too large.', 400);
  }

  return history.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw createHttpError('Invalid history entry at index ' + index + '.', 400);
    }

    const role = String(item.role || '').trim();
    if (role !== 'user' && role !== 'assistant') {
      throw createHttpError('Invalid history role at index ' + index + '.', 400);
    }

    return {
      role,
      text: validateShortText(item.text, 'history[' + index + '].text', MAX_QUERY_LENGTH, true),
    };
  });
}

function validateCandidates(candidates) {
  if (!Array.isArray(candidates) || !candidates.length) {
    throw createHttpError('At least one candidate is required.', 400);
  }

  if (candidates.length > MAX_CANDIDATES) {
    throw createHttpError('Too many candidates.', 400);
  }

  return candidates.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') {
      throw createHttpError('Invalid candidate at index ' + index + '.', 400);
    }

    const badges = Array.isArray(candidate.badges)
      ? candidate.badges.slice(0, MAX_BADGES).map((badge, badgeIndex) => {
          const text = validateShortText(badge, 'candidates[' + index + '].badges[' + badgeIndex + ']', 60, false);
          return text;
        }).filter(Boolean)
      : [];

    return {
      id: validateShortText(candidate.id, 'candidates[' + index + '].id', 120, true),
      title: validateShortText(candidate.title, 'candidates[' + index + '].title', 140, true),
      href: validateShortText(candidate.href, 'candidates[' + index + '].href', 300, true),
      desc: validateShortText(candidate.desc, 'candidates[' + index + '].desc', 360, false),
      domain: validateShortText(candidate.domain, 'candidates[' + index + '].domain', 120, false),
      badges,
      categoryLabel: validateShortText(candidate.categoryLabel, 'candidates[' + index + '].categoryLabel', 80, false),
      sectionLabel: validateShortText(candidate.sectionLabel, 'candidates[' + index + '].sectionLabel', 100, false),
    };
  });
}

function validateImage(image) {
  if (!image) return null;
  if (typeof image !== 'object') {
    throw createHttpError('Invalid image parameter.', 400);
  }
  const mimeType = validateShortText(image.mimeType, 'image.mimeType', 80, true);
  const data = String(image.data || '').trim();
  if (!data) {
    throw createHttpError('Missing field: image.data.', 400);
  }
  return { mimeType, data };
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw createHttpError('Invalid JSON payload.', 400);
  }

  return {
    query: validateShortText(payload.query, 'query', MAX_QUERY_LENGTH, true),
    history: validateHistory(payload.history),
    activeCategory: validateOptionalScope(payload.activeCategory, 'activeCategory'),
    activeSection: validateOptionalScope(payload.activeSection, 'activeSection'),
    candidates: validateCandidates(payload.candidates),
    image: validateImage(payload.image),
  };
}

function buildPrompt(data) {
  const historyBlock = data.history.length
    ? data.history.map((entry, index) => {
        const role = entry.role === 'assistant' ? 'IA' : 'Utilizador';
        return (index + 1) + '. ' + role + ': ' + entry.text;
      }).join('\n')
    : 'Sem histórico anterior.';

  const categoryLabel = data.activeCategory && data.activeCategory.label ? data.activeCategory.label : 'Nenhuma';
  const sectionLabel = data.activeSection && data.activeSection.label ? data.activeSection.label : 'Nenhuma';

  const candidatesBlock = data.candidates.map((candidate, index) => {
    return [
      'Candidato ' + (index + 1),
      'ID: ' + candidate.id,
      'Nome: ' + candidate.title,
      'Categoria: ' + (candidate.categoryLabel || 'Sem categoria'),
      'Secção: ' + (candidate.sectionLabel || 'Sem secção'),
      'Domínio: ' + (candidate.domain || 'Sem domínio'),
      'Badges: ' + (candidate.badges.length ? candidate.badges.join(', ') : 'Nenhuma'),
      'Descrição: ' + (candidate.desc || 'Sem descrição'),
      'URL: ' + candidate.href,
    ].join('\n');
  }).join('\n\n');

  return [
    'És um assistente de recomendação para uma página privada de catálogo.',
    'Responde sempre em português europeu (pt-PT).',
    'Não uses português do Brasil, nem vocabulário brasileiro.',
    'Prefere formas como utilizador, ficheiro, ecrã, telemóvel, registo, equipa e descarregar.',
    'Só podes recomendar itens presentes nos candidatos fornecidos abaixo.',
    'Nunca inventes sites, nomes, links, categorias ou funcionalidades fora dos candidatos.',
    'Se não houver um match claro, admite isso e devolve uma lista vazia.',
    'Se houver candidatos relevantes suficientes, devolve 6 recomendacoes ordenadas da melhor para a menos forte.',
    'Prioriza os candidatos que cobrem mais requisitos explicitos do pedido do utilizador.',
    'Se o pedido tiver dois ou mais termos fortes, evita recomendar candidatos que so correspondam a um deles.',
    'Nao uses mencoes laterais no texto como justificacao principal; a correspondencia deve ser central no titulo, badges, categoria, secao ou descricao.',
    'Dá preferência à categoria ou secção ativa quando isso fizer sentido, mas escolhe o melhor fit geral.',
    'Mantém a resposta curta, útil e profissional.',
    'Devolve JSON estrito neste formato:',
    '{"answer":"texto curto","recommendations":[{"id":"candidate_id","reason":"motivo curto"}]}',
    '',
    'Categoria ativa: ' + categoryLabel,
    'Secção ativa: ' + sectionLabel,
    'Histórico recente:',
    historyBlock,
    '',
    'Pedido atual do utilizador:',
    data.query,
    '',
    'Candidatos disponíveis:',
    candidatesBlock,
  ].join('\n');
}

async function requestGroq(data, env) {
  let model;
  if (data.image) {
    model = String(env.GROQ_VISION_MODEL || DEFAULT_VISION_MODEL).trim() || DEFAULT_VISION_MODEL;
  } else {
    model = String(env.GROQ_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  }

  const prompt = buildPrompt(data);

  let content;
  if (data.image) {
    content = [
      {
        type: 'text',
        text: prompt,
      },
      {
        type: 'image_url',
        image_url: {
          url: 'data:' + data.image.mimeType + ';base64,' + data.image.data,
        },
      },
    ];
  } else {
    content = prompt;
  }

  const messages = [
    {
      role: 'user',
      content: content,
    },
  ];

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.2,
      top_p: 0.9,
      max_tokens: 700,
      response_format: { type: 'json_object' },
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload &&
      payload.error &&
      payload.error.message
        ? String(payload.error.message)
        : 'Groq request failed.';
    throw createHttpError(clampText(message, 260), 502);
  }

  const rawText = extractModelText(payload);
  const parsed = parseModelJson(rawText);
  return sanitizeModelResponse(parsed, data.candidates);
}

function extractModelText(payload) {
  const choices = payload && Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice = choices[0] || {};
  const message = firstChoice.message || {};
  const text = String(message.content || '').trim();

  if (!text) {
    throw createHttpError('Groq returned an empty response.', 502);
  }

  return text;
}

function parseModelJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (_) {
        // Fall through.
      }
    }
  }

  throw createHttpError('Groq returned invalid JSON.', 502);
}

function sanitizeModelResponse(parsed, candidates) {
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const seen = new Set();

  const recommendations = Array.isArray(parsed && parsed.recommendations)
    ? parsed.recommendations
        .map((entry) => ({
          id: clampText(entry && entry.id || '', 120),
          reason: clampText(normalizeEuropeanPortuguese(entry && entry.reason || ''), MAX_REASON_LENGTH),
        }))
        .filter((entry) => {
          if (!entry.id || seen.has(entry.id) || !candidateIds.has(entry.id)) return false;
          seen.add(entry.id);
          return true;
        })
        .slice(0, 6)
    : [];

  // REMOVED FORCE-PADDING LOOP: only return recommendations explicitly made by Gemini!

  const answer = clampText(normalizeEuropeanPortuguese(parsed && parsed.answer || ''), MAX_ANSWER_LENGTH) || (
    recommendations.length
      ? 'Estas parecem ser as melhores opções dentro do catálogo fornecido.'
      : 'Não encontrei um match claro no catálogo fornecido.'
  );

  return {
    answer,
    recommendations,
  };
}

function normalizeEuropeanPortuguese(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  return text
    .replace(/\bvoc[eê]\b/gi, 'tu')
    .replace(/\bvoc[eê]s\b/gi, 'vocês')
    .replace(/\busu[aá]rio\b/gi, 'utilizador')
    .replace(/\busu[aá]rios\b/gi, 'utilizadores')
    .replace(/\bcadastro\b/gi, 'registo')
    .replace(/\bcadastrar\b/gi, 'registar')
    .replace(/\barquivo\b/gi, 'ficheiro')
    .replace(/\barquivos\b/gi, 'ficheiros')
    .replace(/\btela\b/gi, 'ecrã')
    .replace(/\btelas\b/gi, 'ecrãs')
    .replace(/\bcelular\b/gi, 'telemóvel')
    .replace(/\bcelulares\b/gi, 'telemóveis')
    .replace(/\bbaixar\b/gi, 'descarregar')
    .replace(/\bbaixado\b/gi, 'descarregado')
    .replace(/\bbaixando\b/gi, 'a descarregar')
    .replace(/\bcurtir\b/gi, 'gostar')
    .replace(/\bônibus\b/gi, 'autocarro')
    .replace(/\btime\b/gi, 'equipa')
    .replace(/\blegal\b/gi, 'ótimo')
    .replace(/\bsite\b/gi, 'site');
}
