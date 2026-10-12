-- O motor da fila (automações, geração do chat, sincronização) precisa de ser empurrado de minuto a minuto.
-- Na Vercel não há processo permanente, por isso a chamada sai daqui: pg_cron chama /api/public/run-jobs
-- pela pg_net, com a chave guardada em job_runner_config (lida na hora, nunca escrita no agendamento).
CREATE EXTENSION IF NOT EXISTS pg_net;

INSERT INTO public.job_runner_config (id, token)
VALUES (true, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'run-jobs') THEN
    PERFORM cron.schedule(
      'run-jobs',
      '* * * * *',
      $job$
      SELECT net.http_post(
        url := 'https://www.novawebinar.com/api/public/run-jobs',
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-job-runner-token', (SELECT token FROM public.job_runner_config WHERE id = true)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
      );
      $job$
    );
  END IF;
END $$;
