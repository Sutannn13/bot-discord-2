require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Cache config per guild biar ga query DB tiap pesan.
// ponytail: cache ga expire; tiap /set-* manggil invalidateConfig(), jadi tetap konsisten.
const configCache = new Map();

async function getConfig(guildId) {
  if (configCache.has(guildId)) return configCache.get(guildId);
  const { data } = await supabase
    .from('guild_config').select('*').eq('guild_id', guildId).maybeSingle();
  configCache.set(guildId, data || null);
  return data || null;
}

function invalidateConfig(guildId) {
  configCache.delete(guildId);
}

module.exports = { supabase, getConfig, invalidateConfig };
