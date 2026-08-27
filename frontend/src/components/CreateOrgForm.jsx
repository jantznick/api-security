import { useState } from 'react';
import { toast } from 'sonner';
import { authAPI, orgsAPI } from '../api/api';
import useAuthStore from '../store/authStore';
import { useActiveOrg } from '../hooks/useActiveOrg';
import Button from './Button';
import FormField, { inputClassName } from './FormField';

/**
 * Compact form to create a team organization.
 * Refreshes /auth/me so the switcher picks up the new org.
 */
export default function CreateOrgForm({
  onCreated,
  onCancel,
  autoFocus = true,
  className = '',
}) {
  const { setUser } = useAuthStore();
  const { setActiveOrgId } = useActiveOrg();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Enter an organization name');
      return;
    }
    setCreating(true);
    try {
      const data = await orgsAPI.create({ name: trimmed });
      const org = data.organization;
      try {
        const me = await authAPI.me();
        setUser(me.user);
      } catch {
        /* switcher still works via setActiveOrgId once me refreshes later */
      }
      if (org?.id) {
        setActiveOrgId(org.id);
      }
      setName('');
      toast.success(`Created ${org?.name || 'organization'}`);
      onCreated?.(org);
    } catch (err) {
      toast.error(err.message || 'Could not create organization');
    } finally {
      setCreating(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex flex-wrap items-end gap-2 ${className}`.trim()}
    >
      <FormField id="new-org-name" label="Organization name" className="min-w-[12rem] flex-1">
        <input
          id="new-org-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Engineering"
          className={inputClassName}
          maxLength={80}
          required
          autoFocus={autoFocus}
          disabled={creating}
        />
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={creating}>
          {creating ? 'Creating…' : 'Create organization'}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={creating}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
