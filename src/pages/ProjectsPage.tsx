import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { supabase } from '../lib/supabase';

interface ProjectsPageProps {
  session: Session;
}

interface ProjectRecord {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  created_at: string;
}

interface ProjectFormState {
  name: string;
  description: string;
  status: string;
}

const initialFormState: ProjectFormState = {
  name: '',
  description: '',
  status: 'active',
};

export function ProjectsPage({ session }: ProjectsPageProps) {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [role, setRole] = useState('viewer');
  const [formState, setFormState] = useState<ProjectFormState>(initialFormState);

  const isAdmin = useMemo(() => role === 'admin', [role]);

  useEffect(() => {
    let isActive = true;

    async function bootstrapProjectsPhase() {
      if (!supabase) {
        if (isActive) {
          setIsLoading(false);
          setErrorMessage('Supabase environment variables are missing. Add your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY values to continue.');
        }
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      const metadataRole = session.user.user_metadata?.role;
      if (typeof metadataRole === 'string' && metadataRole.length > 0) {
        setRole(metadataRole);
      }

      const profileResponse = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();

      if (!profileResponse.error && profileResponse.data?.role) {
        setRole(profileResponse.data.role);
      }

      const projectsResponse = await supabase
        .from('projects')
        .select('id,name,description,status,created_at')
        .order('created_at', { ascending: false });

      if (!isActive) {
        return;
      }

      if (projectsResponse.error) {
        setErrorMessage(projectsResponse.error.message);
        setProjects([]);
        setIsLoading(false);
        return;
      }

      setProjects(projectsResponse.data ?? []);
      setIsLoading(false);
    }

    void bootstrapProjectsPhase();

    return () => {
      isActive = false;
    };
  }, [session.user.id, session.user.user_metadata]);

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setErrorMessage('Supabase client is unavailable. Check your environment configuration.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const payload = {
      name: formState.name.trim(),
      description: formState.description.trim() || null,
      status: formState.status.trim() || 'active',
      created_by: session.user.id,
    };

    const response = await supabase
      .from('projects')
      .insert(payload)
      .select('id,name,description,status,created_at')
      .single();

    setIsSubmitting(false);

    if (response.error) {
      setErrorMessage(response.error.message);
      return;
    }

    setProjects((currentProjects) => [response.data, ...currentProjects]);
    setFormState(initialFormState);
    setSuccessMessage('Project created successfully.');
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold text-slate-900">Phase 2: Projects</h1>
        <p className="mt-1 text-sm text-slate-500">Create and review projects directly from Supabase-backed data.</p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <Card>
          <h2 className="text-lg font-semibold text-slate-900">Create Project</h2>
          <p className="mt-1 text-sm text-slate-500">Only admins can create new projects.</p>
          <p className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Current role: {role}
          </p>

          {!isAdmin ? (
            <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">You need an admin role to create projects.</p>
          ) : (
            <form className="mt-4 space-y-4" onSubmit={handleCreateProject}>
              <Input
                label="Project Name"
                onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. Riverside Expansion"
                required
                value={formState.name}
              />
              <Input
                label="Status"
                onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value }))}
                placeholder="active"
                required
                value={formState.status}
              />
              <Input
                label="Description"
                onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
                placeholder="Optional project notes"
                value={formState.description}
              />
              <Button className="w-full" disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Creating…' : 'Create Project'}
              </Button>
            </form>
          )}

          {errorMessage ? <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p> : null}
          {successMessage ? <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMessage}</p> : null}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Project List</h2>
            <p className="text-sm text-slate-500">{projects.length} total</p>
          </div>

          {isLoading ? <p className="mt-4 text-sm text-slate-500">Loading projects…</p> : null}

          {!isLoading && projects.length === 0 ? (
            <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">No projects found. Create your first project to get started.</p>
          ) : null}

          {!isLoading && projects.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Description</th>
                    <th className="py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => (
                    <tr className="border-b border-slate-100" key={project.id}>
                      <td className="py-3 pr-3 font-medium text-slate-800">{project.name}</td>
                      <td className="py-3 pr-3 text-slate-600">{project.status ?? '—'}</td>
                      <td className="py-3 pr-3 text-slate-600">{project.description ?? '—'}</td>
                      <td className="py-3 text-slate-600">{new Date(project.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      </section>
    </div>
  );
}
