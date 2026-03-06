import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../lib/store';

interface PaymentIn {
    id: string;
    buyer_id: string;
    reservation_id: string;
    amount_kobo: number;
    reference_code: string | null;
    receipt_url: string | null;
    notes: string | null;
    status: 'pending' | 'confirmed' | 'rejected';
    instalment_number: number;
    created_at: string;
    reservations?: {
        reference_code: string;
        units?: { unit_number: string; unit_type: string };
    };
    buyers?: {
        leads?: { name: string; phone: string };
    };
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export function FinanceView() {
    const { organisation: currentOrg } = useAppStore();
    const [payments, setPayments] = useState<PaymentIn[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'pending' | 'confirmed' | 'rejected'>('pending');
    const [processing, setProcessing] = useState<string | null>(null);
    const [rejectModal, setRejectModal] = useState<{ paymentId: string } | null>(null);
    const [rejectReason, setRejectReason] = useState('');

    const fetchPayments = useCallback(async () => {
        if (!currentOrg) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('payments_in')
            .select(`
        *,
        reservations(reference_code, units(unit_number, unit_type)),
        buyers(leads(name, phone))
      `)
            .eq('organisation_id', currentOrg.id)
            .eq('status', activeTab)
            .order('created_at', { ascending: false })
            .limit(50);

        if (!error && data) setPayments(data as PaymentIn[]);
        setLoading(false);
    }, [currentOrg, activeTab]);

    useEffect(() => { fetchPayments(); }, [fetchPayments]);

    const handleConfirm = async (paymentId: string) => {
        if (!currentOrg) return;
        setProcessing(paymentId);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`${SUPABASE_URL}/functions/v1/on-payment-confirmed`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({
                    payment_id: paymentId,
                    action: 'confirm',
                    organisation_id: currentOrg.id,
                }),
            });
            if (res.ok) fetchPayments();
            else {
                const err = await res.json();
                alert(err.error || 'Failed to confirm payment');
            }
        } catch (e: any) {
            alert('Error: ' + e.message);
        }
        setProcessing(null);
    };

    const handleReject = async () => {
        if (!currentOrg || !rejectModal) return;
        setProcessing(rejectModal.paymentId);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`${SUPABASE_URL}/functions/v1/on-payment-confirmed`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({
                    payment_id: rejectModal.paymentId,
                    action: 'reject',
                    rejection_reason: rejectReason,
                    organisation_id: currentOrg.id,
                }),
            });
            if (res.ok) {
                fetchPayments();
                setRejectModal(null);
                setRejectReason('');
            } else {
                const err = await res.json();
                alert(err.error || 'Failed to reject payment');
            }
        } catch (e: any) {
            alert('Error: ' + e.message);
        }
        setProcessing(null);
    };

    const tabs = [
        { key: 'pending' as const, label: 'Pending Review', color: 'text-amber-400' },
        { key: 'confirmed' as const, label: 'Confirmed', color: 'text-emerald-400' },
        { key: 'rejected' as const, label: 'Rejected', color: 'text-red-400' },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Finance</h1>
                <p className="text-sm text-zinc-400 mt-1">Review and confirm payment receipts</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${activeTab === tab.key
                                ? 'bg-zinc-700 text-white'
                                : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : payments.length === 0 ? (
                <div className="text-center py-16 text-zinc-500">
                    <p className="text-4xl mb-3">💳</p>
                    <p className="font-medium text-zinc-300">No {activeTab} payments</p>
                    <p className="text-sm mt-1">{activeTab === 'pending' ? 'Payments submitted by buyers will appear here.' : `No ${activeTab} payments yet.`}</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {payments.map(p => {
                        const amountNGN = (p.amount_kobo / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });
                        const buyer = p.buyers?.leads;
                        const unit = p.reservations?.units;
                        const isPending = p.status === 'pending';

                        return (
                            <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col md:flex-row gap-4">
                                {/* Info */}
                                <div className="flex-1 space-y-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-white text-lg">{amountNGN}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                      ${p.status === 'pending' ? 'bg-amber-500/20 text-amber-300' :
                                                p.status === 'confirmed' ? 'bg-emerald-500/20 text-emerald-300' :
                                                    'bg-red-500/20 text-red-300'}`}>
                                            {p.status}
                                        </span>
                                    </div>
                                    {buyer && (
                                        <p className="text-sm text-zinc-300">
                                            <span className="text-zinc-500">Buyer:</span> {buyer.name} · {buyer.phone}
                                        </p>
                                    )}
                                    {unit && (
                                        <p className="text-sm text-zinc-300">
                                            <span className="text-zinc-500">Unit:</span> #{unit.unit_number} ({unit.unit_type})
                                        </p>
                                    )}
                                    {p.reservations?.reference_code && (
                                        <p className="text-xs text-zinc-500 font-mono">Ref: {p.reservations.reference_code}</p>
                                    )}
                                    {p.reference_code && (
                                        <p className="text-xs text-zinc-500">Payment ref: {p.reference_code}</p>
                                    )}
                                    <p className="text-xs text-zinc-600">Submitted {new Date(p.created_at).toLocaleString()}</p>
                                    {p.notes && (
                                        <p className="text-xs text-zinc-400 italic">Note: {p.notes}</p>
                                    )}
                                </div>

                                {/* Receipt preview */}
                                {p.receipt_url && (
                                    <div className="shrink-0">
                                        <a href={p.receipt_url} target="_blank" rel="noreferrer">
                                            <img
                                                src={p.receipt_url}
                                                alt="receipt"
                                                className="w-24 h-24 object-cover rounded-lg border border-zinc-700 hover:opacity-80 transition-opacity"
                                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
                                        </a>
                                        <p className="text-xs text-zinc-500 text-center mt-1">Receipt</p>
                                    </div>
                                )}

                                {/* Actions */}
                                {isPending && (
                                    <div className="flex flex-col gap-2 shrink-0">
                                        <button
                                            id={`confirm-payment-${p.id}`}
                                            onClick={() => handleConfirm(p.id)}
                                            disabled={processing === p.id}
                                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                                        >
                                            {processing === p.id ? '...' : '✓ Confirm'}
                                        </button>
                                        <button
                                            id={`reject-payment-${p.id}`}
                                            onClick={() => setRejectModal({ paymentId: p.id })}
                                            disabled={processing === p.id}
                                            className="px-4 py-2 bg-zinc-700 hover:bg-red-900/60 disabled:opacity-50 text-zinc-300 hover:text-red-300 text-sm font-medium rounded-lg transition-colors"
                                        >
                                            ✗ Reject
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Reject modal */}
            {rejectModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md space-y-4">
                        <h3 className="text-lg font-bold text-white">Reject Payment</h3>
                        <p className="text-sm text-zinc-400">Provide a reason. The buyer will be notified and the unit will return to Available.</p>
                        <textarea
                            id="reject-reason-input"
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            placeholder="e.g. Receipt unclear, amount mismatch..."
                            rows={3}
                            className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 resize-none"
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setRejectModal(null); setRejectReason(''); }}
                                className="flex-1 px-4 py-2 bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-600 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                id="confirm-reject-btn"
                                onClick={handleReject}
                                disabled={!rejectReason.trim() || processing !== null}
                                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                                {processing ? '...' : 'Reject Payment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
