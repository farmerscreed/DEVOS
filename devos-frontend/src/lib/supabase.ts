import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://gvcadlzjpsfabrqkzdwt.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper to get current org from subdomain
export function getSubdomain(): string | null {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        // For local development, check query param or return null
        const params = new URLSearchParams(window.location.search);
        return params.get('org');
    }

    const parts = hostname.split('.');
    if (parts.length >= 3 && parts[parts.length - 1] === 'app') {
        return parts[0];
    }
    return null;
}

// Types
export interface Organisation {
    id: string;
    name: string;
    slug: string;
    plan_tier: string;
    billing_status: string;
    timezone: string;
    enabled_channels: string[];
    logo_url: string | null;
    primary_color: string | null;
    settings: Record<string, unknown>;
}

export interface Lead {
    id: string;
    organisation_id: string;
    project_id: string | null;
    name: string;
    phone: string;
    email: string | null;
    city: string | null;
    country: string;
    budget_min_kobo: number | null;
    budget_max_kobo: number | null;
    investment_type: string | null;
    unit_interest: string | null;
    score: number;
    category: string;
    status: string;
    preferred_channel: string;
    created_at: string;
}

export interface LeadFormData {
    name: string;
    phone: string;
    email?: string;
    city?: string;
    country?: string;
    budget_min?: number;
    budget_max?: number;
    investment_type?: string;
    unit_interest?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
}
