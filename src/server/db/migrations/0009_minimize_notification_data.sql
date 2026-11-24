UPDATE outbox_jobs
SET payload = '{}'::jsonb,
    last_error = CASE WHEN status = 'failed' THEN 'Email delivery failed' ELSE NULL END
WHERE kind = 'email' AND status IN ('done', 'failed');
--> statement-breakpoint
UPDATE payment_events
SET payload = jsonb_build_object(
  'checkoutSessionId', CASE WHEN type LIKE 'checkout.session.%' THEN payload #>> '{data,object,id}' END,
  'orderId', CASE WHEN type LIKE 'checkout.session.%' THEN coalesce(
    payload #>> '{data,object,metadata,order_id}', payload #>> '{data,object,client_reference_id}'
  ) END
)
WHERE payload ? 'data';
