import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { billingAPI } from '../api/api';
import Button from './Button';
import FormField, { inputClassName } from './FormField';

/**
 * Modal form for Enterprise / contact-sales inquiries.
 * Submits to POST /api/billing/contact-sales.
 */
export default function ContactSalesForm({
  planSlug = 'enterprise',
  planName = 'Enterprise',
  source = 'billing',
  defaultEmail = '',
  defaultName = '',
  open,
  onClose,
}) {
  const [name, setName] = useState(defaultName || '');
  const [email, setEmail] = useState(defaultEmail || '');
  const [company, setCompany] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setName(defaultName || '');
      setEmail(defaultEmail || '');
      setCompany('');
      setMessage('');
      setDone(false);
    }
  }, [open, defaultName, defaultEmail]);

  if (!open) return null;

  const handleClose = () => {
    setDone(false);
    onClose?.();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await billingAPI.contactSales({
        name: name.trim(),
        email: email.trim(),
        company: company.trim() || undefined,
        message: message.trim() || undefined,
        planSlug,
        source,
      });
      setDone(true);
      toast.success('Thanks — we’ll be in touch soon.');
    } catch (err) {
      toast.error(err.message || 'Could not send your request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-sales-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-ink-200 bg-white p-5 shadow-lg sm:p-6">
        {done ? (
          <div>
            <h2
              id="contact-sales-title"
              className="font-display text-lg font-bold text-ink-900"
            >
              Request received
            </h2>
            <p className="mt-2 text-sm text-ink-600">
              Thanks for your interest in {planName}. We’ll follow up at the email
              you provided.
            </p>
            <Button className="mt-6 w-full" onClick={handleClose}>
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2
              id="contact-sales-title"
              className="font-display text-lg font-bold text-ink-900"
            >
              Contact sales — {planName}
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              Tell us a bit about your team and we’ll get back to you.
            </p>

            <div className="mt-5 space-y-4">
              <FormField id="contact-name" label="Name">
                <input
                  id="contact-name"
                  name="name"
                  className={inputClassName}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </FormField>
              <FormField id="contact-email" label="Work email">
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  className={inputClassName}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </FormField>
              <FormField id="contact-company" label="Company">
                <input
                  id="contact-company"
                  name="company"
                  className={inputClassName}
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  autoComplete="organization"
                />
              </FormField>
              <FormField id="contact-message" label="What are you looking for?">
                <textarea
                  id="contact-message"
                  name="message"
                  rows={3}
                  className={inputClassName}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Team size, API volume, timeline…"
                />
              </FormField>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? 'Sending…' : 'Send request'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleClose}
                disabled={submitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
