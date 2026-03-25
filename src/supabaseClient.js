import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://uhzpkkvbowcznneplicp.supabase.co';
const supabaseKey = 'sb_publishable_WI_GgaI2DjRd8Gn9KPUuUg_i1iblfec';

export const supabase = createClient(supabaseUrl, supabaseKey);