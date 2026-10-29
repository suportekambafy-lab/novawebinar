// Middleware de server functions: exige Bearer JWT do Supabase e expõe um cliente com RLS.
import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

/**
 * Antes de usar a chave de serviço com um webinarId vindo do cliente: o RLS de
 * `webinars` só deixa ver webinars da organização de quem pede.
 */
export async function assertWebinarAccess(
  supabase: SupabaseClient<Database>,
  webinarId: string,
): Promise<string> {
  const { data } = await supabase
    .from('webinars')
    .select('organization_id')
    .eq('id', webinarId)
    .maybeSingle();
  if (!data) throw new Error('Webinar não encontrado.');
  return data.organization_id;
}

/**
 * Acesso ao webinar para ESCREVER ou gastar créditos: o mesmo que assertWebinarAccess, mas quem só
 * atende (papel «suporte») fica de fora. Usar antes de qualquer escrita com a chave de serviço ou
 * chamada à IA paga, que passam por cima das regras de leitura da equipa de suporte.
 */
export async function assertWebinarWriter(
  supabase: SupabaseClient<Database>,
  webinarId: string,
): Promise<string> {
  const organizationId = await assertWebinarAccess(supabase, webinarId);
  const { data: supportOnly, error } = await supabase.rpc('is_support_only', { _organization_id: organizationId });
  if (error) throw new Error('Não foi possível confirmar a permissão. Tente novamente.');
  if (supportOnly) throw new Error('A equipa de suporte não pode fazer esta alteração nem gastar créditos.');
  return organizationId;
}




function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    
    const SUPABASE_URL = process.env['SUPABASE_URL'];
    const SUPABASE_PUBLISHABLE_KEY = process.env['SUPABASE_PUBLISHABLE_KEY'];

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      const missing = [
        ...(!SUPABASE_URL ? ['SUPABASE_URL'] : []),
        ...(!SUPABASE_PUBLISHABLE_KEY ? ['SUPABASE_PUBLISHABLE_KEY'] : []),
      ];
      const message = `Missing Supabase environment variable(s): ${missing.join(', ')}. Define-as no .env (ver .env.example).`;
      console.error(`[Supabase] ${message}`);
      throw new Error(message);
    }
    
    const request = getRequest();

    if (!request?.headers) {
      throw new Error('Unauthorized: No request headers available');
    }


    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      throw new Error('Unauthorized: No authorization header provided');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new Error('Unauthorized: Only Bearer tokens are supported');
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      throw new Error('Unauthorized: No token provided');
    }

    if (token.split('.').length !== 3) {
      throw new Error('Unauthorized: Invalid token');
    }

    const supabase = createClient<Database>(
      SUPABASE_URL!,
      SUPABASE_PUBLISHABLE_KEY!,
      {
        global: {
          fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY!),
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        auth: {
          storage: undefined,
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims) {
      throw new Error('Unauthorized: Invalid token');
    }

    if (!data.claims.sub) {
      throw new Error('Unauthorized: No user ID found in token');
    }

    return next({
      context: {
        supabase,
        userId: data.claims.sub,
        claims: data.claims,
      },
    });
  },
);
