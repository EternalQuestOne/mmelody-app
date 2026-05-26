import { useSessionContext, useUser as useSupabaseUser } from '@supabase/auth-helpers-react';

export const useUser = () => {
  const { session } = useSessionContext();
  const user = useSupabaseUser();
  return { user, accessToken: session?.access_token };
};