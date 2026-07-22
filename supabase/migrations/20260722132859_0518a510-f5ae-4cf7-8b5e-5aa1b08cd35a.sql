
-- Store CRON_SECRET in vault and reschedule fuel-price cron with proper auth header
SELECT vault.create_secret('CmZS2f25YooB2W0z4ryUAdOyogZn42KqekZ3z8eiNCZD01oo', 'cron_secret', 'Secret used to authorize cron-triggered public hook endpoints');

SELECT cron.unschedule(2);

SELECT cron.schedule(
  'fetch-fuel-price-daily',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://project--0948beb0-54b7-448e-86bd-8deade8838db.lovable.app/api/public/hooks/fetch-fuel-price',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
