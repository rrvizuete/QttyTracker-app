import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export async function provisionUserProfile(session: Session): Promise<void> {
  if (!supabase) {
    return;
  }

  await supabase.from('profiles').upsert(
    {
      id: session.user.id,
      email: session.user.email?.trim().toLowerCase() ?? '',
      access_level: 'admin',
    },
    { onConflict: 'id' },
  );
}
