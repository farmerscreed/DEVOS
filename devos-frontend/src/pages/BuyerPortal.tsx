import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface Buyer {
    id: string;
    reservation_id: string;
    unit_id: string;
    organisation_id: string;
    leads?: { name: string; phone: string; email: string };
    reservations?: {
        reference_code: string;
        expires_at: string;
        status: string;
        units?: { unit_number: string; unit_type: string; floor: number; price_kobo: number };
    };
}

interface PaymentScheduleItem {
    id: string;
    instalment_number: number;
    amount_kobo: number;
    currency: string;
    due_date: string;
    status: 'pending' | 'paid' | 'overdue';
    paid_at?: string;
}

interface Document {
    id: string;
    document_type: string;
    file_url: string | null;
    status: string;
    created_at: string;
}

interface ProgressUpdate {
    id: string;
    percent_complete: number;
    summary: string;
    photo_urls: string[];
    submitted_at: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export function BuyerPortal() {
    const navigate = useNavigate();
    const [user, setUser] = useState<any>(null);
    const [buyer, setBuyer] = useState<Buyer | null>(null);
    const [schedule, setSchedule] = useState<PaymentScheduleItem[]>([]);
    const [documents, setDocuments] = useState<Document[]>([]);
    const [progress, setProgress] = useState<ProgressUpdate | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'payments' | 'construction' | 'documents' | 'support'>('payments');
    const [supportMsg, setSupportMsg] = useState('');
    const [sendingMsg, setSendingMsg] = useState(false);
    const [sentOk, setSentOk] = useState(false);

    // Auth check
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }: { data: { session: { user: any } | null } }) => {
            if (!session) { navigate('/buyer/login'); return; }
            setUser(session.user);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: { user: any } | null) => {
            if (_event === 'SIGNED_OUT') navigate('/buyer/login');
            if (session) setUser(session.user);
        });
        return () => subscription.unsubscribe();
    }, [navigate]);

    const loadData = useCallback(async () => {
        if (!user) return;
        setLoading(true);

        // Find buyer record by user_id OR lead email
        const { data: buyerData } = await supabase
            .from('buyers')
            .select(`
        *,
        leads(name, phone, email),
        reservations(reference_code, expires_at, status, units(unit_number, unit_type, floor, price_kobo))
      `)
            .eq('user_id', user.id)
            .single();

        if (buyerData) {
            setBuyer(buyerData as Buyer);

            // Payment schedule
            const { data: sched } = await supabase
                .from('payment_schedule')
                .select('*')
                .eq('buyer_id', buyerData.id)
                .order('instalment_number', { ascending: true });
            setSchedule((sched as PaymentScheduleItem[]) || []);

            // Documents
            const { data: docs } = await supabase
                .from('documents')
                .select('*')
                .eq('buyer_id', buyerData.id)
                .order('created_at', { ascending: false });
            setDocuments((docs as Document[]) || []);

            // Latest construction update for this org
            const { data: prog } = await supabase
                .from('progress_updates')
                .select('*')
                .eq('organisation_id', buyerData.organisation_id)
                .order('submitted_at', { ascending: false })
                .limit(1)
                .single();
            if (prog) setProgress(prog as ProgressUpdate);
        }

        setLoading(false);
    }, [user]);

    useEffect(() => { loadData(); }, [loadData]);

    const sendSupportMessage = async () => {
        if (!supportMsg.trim() || !buyer) return;
        setSendingMsg(true);
        await supabase.from('message_threads').insert({
            organisation_id: buyer.organisation_id,
            lead_id: null,
            channel: 'buyer_portal',
            direction: 'inbound',
            content: supportMsg,
            is_agent_message: false,
            source: 'buyer_portal',
            metadata: { buyer_id: buyer.id, user_id: user?.id },
        });
        setSupportMsg('');
        setSentOk(true);
        setTimeout(() => setSentOk(false), 5000);
        setSendingMsg(false);
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        navigate('/buyer/login');
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!buyer) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
                <div className="text-center max-w-sm">
                    <p className="text-4xl mb-4">🏠</p>
                    <h2 className="text-xl font-bold text-white mb-2">Account not linked</h2>
                    <p className="text-zinc-400 text-sm">No buyer record found for your account. Please contact support.</p>
                    <button onClick={handleSignOut} className="mt-4 text-sm text-zinc-500 underline">Sign out</button>
                </div>
            </div>
        );
    }

    const unit = buyer.reservations?.units;
    const reservation = buyer.reservations;
    const buyerName = buyer.leads?.name || user?.email || 'Buyer';
    const totalInstalments = schedule.length;
    const paidInstalments = schedule.filter(s => s.status === 'paid').length;
    const progressPct = totalInstalments > 0 ? Math.round((paidInstalments / totalInstalments) * 100) : 0;
    const nextDue = schedule.find(s => s.status === 'pending');

    const tabs = [
        { key: 'payments' as const, label: '💳 Payments', id: 'tab-payments' },
        { key: 'construction' as const, label: '🏗️ Construction', id: 'tab-construction' },
        { key: 'documents' as const, label: '📄 Documents', id: 'tab-documents' },
        { key: 'support' as const, label: '💬 Support', id: 'tab-support' },
    ];

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            {/* Topbar */}
            <header className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="text-xl font-bold">🏠</span>
                    <div>
                        <p className="text-sm font-semibold text-white leading-tight">Buyer Portal</p>
                        <p className="text-xs text-zinc-400 leading-tight">{buyerName}</p>
                    </div>
                </div>
                <button onClick={handleSignOut} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Sign out</button>
            </header>

            <main className="max-w-2xl mx-auto p-4 space-y-5">

                {/* Unit card */}
                {unit && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Your Unit</p>
                                <h2 className="text-xl font-bold text-white">Unit #{unit.unit_number}</h2>
                                <p className="text-zinc-400 text-sm capitalize">{unit.unit_type} · Floor {unit.floor}</p>
                                <p className="text-zinc-300 text-sm font-medium mt-1">
                                    ₦{(unit.price_kobo / 100).toLocaleString('en-NG')}
                                </p>
                            </div>
                            {reservation && (
                                <div className={`text-xs px-2 py-1 rounded-full font-medium
                  ${reservation.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                                    {reservation.status}
                                </div>
                            )}
                        </div>
                        {reservation?.reference_code && (
                            <p className="mt-3 text-xs text-zinc-500 font-mono">Ref: {reservation.reference_code}</p>
                        )}
                    </div>
                )}

                {/* Tabs */}
                <div className="flex gap-1 overflow-x-auto bg-zinc-900 border border-zinc-800 rounded-xl p-1 scrollbar-none">
                    {tabs.map(tab => (
                        <button
                            key={tab.key}
                            id={tab.id}
                            onClick={() => setActiveTab(tab.key)}
                            className={`shrink-0 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all
                ${activeTab === tab.key ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                {activeTab === 'payments' && (
                    <div className="space-y-4">
                        {/* Progress bar */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-sm font-medium text-zinc-300">Payment Progress</p>
                                <span className="text-sm font-bold text-white">{paidInstalments}/{totalInstalments}</span>
                            </div>
                            <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden">
                                <div
                                    className="h-3 rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-700"
                                    style={{ width: `${progressPct}%` }}
                                />
                            </div>
                            <p className="text-xs text-zinc-500 mt-2">{progressPct}% paid</p>

                            {nextDue ? (
                                <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                                    <p className="text-xs text-blue-300">Next payment due</p>
                                    <p className="text-sm font-semibold text-white mt-0.5">
                                        ₦{(nextDue.amount_kobo / 100).toLocaleString('en-NG')} · {new Date(nextDue.due_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
                                    </p>
                                    <p className="text-xs text-blue-400 mt-1">Use ref <span className="font-mono">{reservation?.reference_code}</span> when paying</p>
                                </div>
                            ) : totalInstalments === 0 ? (
                                <div className="mt-4 p-3 bg-zinc-800 rounded-xl">
                                    <p className="text-xs text-zinc-400">
                                        {reservation?.expires_at
                                            ? `Your first payment is due — reservation expires ${new Date(reservation.expires_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long' })}. Contact us to get your payment schedule.`
                                            : 'Contact us to receive your payment schedule.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                                    <p className="text-sm text-emerald-300 font-medium">🎉 All payments complete!</p>
                                </div>
                            )}
                        </div>

                        {/* Instalment list */}
                        {schedule.length > 0 && (
                            <div className="space-y-2">
                                {schedule.map(item => (
                                    <div key={item.id} className={`flex items-center justify-between p-3 rounded-xl border
                    ${item.status === 'paid' ? 'bg-emerald-950/20 border-emerald-500/20' :
                                            item.status === 'overdue' ? 'bg-red-950/20 border-red-500/20' :
                                                'bg-zinc-900 border-zinc-800'}`}
                                    >
                                        <div>
                                            <p className="text-sm font-medium text-white">
                                                Instalment {item.instalment_number}
                                                {item.status === 'paid' && <span className="ml-2 text-emerald-400">✓</span>}
                                                {item.status === 'overdue' && <span className="ml-2 text-red-400">!</span>}
                                            </p>
                                            <p className="text-xs text-zinc-400">Due {new Date(item.due_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                        </div>
                                        <p className="text-sm font-bold text-white">₦{(item.amount_kobo / 100).toLocaleString('en-NG')}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'construction' && (
                    <div className="space-y-4">
                        {progress ? (
                            <>
                                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-sm font-medium text-zinc-300">Construction Progress</p>
                                        <span className="text-lg font-bold text-white">{progress.percent_complete}%</span>
                                    </div>
                                    <div className="w-full bg-zinc-800 rounded-full h-4 overflow-hidden">
                                        <div
                                            className="h-4 rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-700"
                                            style={{ width: `${progress.percent_complete}%` }}
                                        />
                                    </div>
                                    <p className="text-sm text-zinc-300 mt-3">{progress.summary}</p>
                                    <p className="text-xs text-zinc-500 mt-1">Last updated {new Date(progress.submitted_at).toLocaleString()}</p>
                                </div>

                                {progress.photo_urls && progress.photo_urls.length > 0 && (
                                    <div className="grid grid-cols-2 gap-2">
                                        {progress.photo_urls.map((url, i) => (
                                            <a key={i} href={url} target="_blank" rel="noreferrer">
                                                <img src={url} alt={`Site photo ${i + 1}`} className="w-full aspect-video object-cover rounded-xl border border-zinc-800 hover:opacity-80 transition-opacity" />
                                            </a>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-center py-12 text-zinc-500">
                                <p className="text-3xl mb-3">🏗️</p>
                                <p className="text-zinc-300">No construction updates yet</p>
                                <p className="text-sm mt-1">Updates will appear here as work progresses.</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'documents' && (
                    <div className="space-y-3">
                        {documents.length === 0 ? (
                            <div className="text-center py-12 text-zinc-500">
                                <p className="text-3xl mb-3">📄</p>
                                <p className="text-zinc-300">No documents yet</p>
                                <p className="text-sm mt-1">Your Reservation Letter will appear here once your payment is confirmed.</p>
                            </div>
                        ) : (
                            documents.map(doc => {
                                const docLabels: Record<string, string> = {
                                    reservation_letter: '📋 Reservation Letter',
                                    sale_agreement: '📑 Sale Agreement',
                                    payment_receipt: '🧾 Payment Receipt',
                                    handover_certificate: '🔑 Handover Certificate',
                                    notice_of_default: '⚠️ Notice of Default',
                                };
                                return (
                                    <div key={doc.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                                        <div>
                                            <p className="text-sm font-medium text-white">{docLabels[doc.document_type] || doc.document_type}</p>
                                            <p className="text-xs text-zinc-500">{new Date(doc.created_at).toLocaleDateString()}</p>
                                        </div>
                                        <div>
                                            {doc.status === 'ready' && doc.file_url ? (
                                                <a
                                                    href={doc.file_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    id={`download-${doc.id}`}
                                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
                                                >
                                                    Download
                                                </a>
                                            ) : (
                                                <span className={`text-xs px-2 py-1 rounded-full
                          ${doc.status === 'generating' ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'}`}>
                                                    {doc.status === 'generating' ? 'Generating...' : 'Failed'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {activeTab === 'support' && (
                    <div className="space-y-4">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                            <p className="text-sm font-medium text-white mb-1">Send a message</p>
                            <p className="text-xs text-zinc-400 mb-3">Our sales team typically responds within a few hours.</p>
                            <textarea
                                id="support-message-input"
                                value={supportMsg}
                                onChange={e => setSupportMsg(e.target.value)}
                                placeholder="Type your message here..."
                                rows={4}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 resize-none"
                            />
                            <button
                                id="send-support-btn"
                                onClick={sendSupportMessage}
                                disabled={!supportMsg.trim() || sendingMsg}
                                className="mt-3 w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
                            >
                                {sendingMsg ? 'Sending...' : 'Send Message'}
                            </button>
                            {sentOk && (
                                <p className="text-xs text-emerald-400 text-center mt-2">✓ Message sent! We'll get back to you soon.</p>
                            )}
                        </div>
                    </div>
                )}

            </main>
        </div>
    );
}

// Stub login page for buyers
export function BuyerLogin() {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
        if (authErr) {
            setError(authErr.message);
            setLoading(false);
        } else {
            navigate('/buyer');
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
            <div className="w-full max-w-sm space-y-6">
                <div className="text-center">
                    <p className="text-4xl mb-3">🏠</p>
                    <h1 className="text-xl font-bold text-white">Buyer Portal</h1>
                    <p className="text-sm text-zinc-400 mt-1">Sign in to track your property purchase</p>
                </div>
                <form onSubmit={handleLogin} className="space-y-3">
                    <input
                        type="email"
                        id="buyer-login-email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="Email address"
                        required
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                    />
                    <input
                        type="password"
                        id="buyer-login-password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Password"
                        required
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                    />
                    {error && <p className="text-xs text-red-400">{error}</p>}
                    <button
                        type="submit"
                        id="buyer-login-btn"
                        disabled={loading}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
                    >
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>
            </div>
        </div>
    );
}
