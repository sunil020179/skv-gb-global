// FULL APP CODE
<button onClick={()=>del(p.id)} className="text-red-600">Delete</button>
</td>
</tr>
))}
{payments.length===0 && <tr><td colSpan={7} className="py-6 text-center text-slate-400">No records yet</td></tr>}
</tbody>
</table>
</div>
</SectionCard>
</>
)
}


function Reports({totals}:{totals:any;}){
const exportAll = () => {
const rows = [
["Report","Value"],
["Sales Base", fmt(totals.salesBase)],
["Sales VAT", fmt(totals.salesTax)],
["Sales Total (with VAT)", fmt(totals.salesGross)],
["Purchases Base", fmt(totals.purBase)],
["Purchases VAT", fmt(totals.purTax)],
["Purchases Total (with VAT)", fmt(totals.purGross)],
["VAT Payable", fmt(totals.vatPayable)],
["VAT Recoverable", fmt(totals.vatRecoverable)],
["Receipts (In)", fmt(totals.receipts)],
["Payments (Out)", fmt(totals.payouts)],
["Profit (approx)", fmt(totals.profitApprox)],
];
downloadCSV(asCSV(rows), `summary_${new Date().toISOString().slice(0,10)}.csv`);
}


return (
<div className="grid md:grid-cols-2 gap-4">
<div className="bg-white rounded-2xl shadow-sm border p-4">
<h3 className="text-lg font-semibold mb-3">Summary</h3>
<ul className="space-y-1 text-sm">
<li>Sales (Taxable): <b>{fmt(totals.salesBase)}</b></li>
<li>Sales VAT: <b>{fmt(totals.salesTax)}</b></li>
<li>Sales Total (with VAT): <b>{fmt(totals.salesGross)}</b></li>
<li className="mt-2">Purchases (Taxable): <b>{fmt(totals.purBase)}</b></li>
<li>Purchases VAT: <b>{fmt(totals.purTax)}</b></li>
<li>Purchases Total (with VAT): <b>{fmt(totals.purGross)}</b></li>
<li className="mt-2">VAT Payable: <b>{fmt(totals.vatPayable)}</b></li>
<li>or VAT Recoverable: <b>{fmt(totals.vatRecoverable)}</b></li>
<li className="mt-2">Receipts (In): <b>{fmt(totals.receipts)}</b></li>
<li>Payments (Out): <b>{fmt(totals.payouts)}</b></li>
<li className="mt-2">Profit (approx): <b>{fmt(totals.profitApprox)}</b></li>
</ul>
<button onClick={exportAll} className="mt-4 px-3 py-2 rounded-xl border flex items-center gap-2"><Download className="w-4 h-4"/>Export Summary CSV</button>
</div>


<div className="bg-white rounded-2xl shadow-sm border p-4">
<h3 className="text-lg font-semibold mb-3">Quick Notes</h3>
<ul className="mt-2 text-sm list-disc pl-5 space-y-1">
<li>Invoice/Receipt PDF एक क्लिक में बनता है (Sales/Payments लिस्ट में PDF बटन)</li>
<li>हेडर में Company, TRN, Address, Email, Phone भरें ताकि PDF पर आए</li>
<li>PIN Login अभी browser-level है; proper backend login बाद में जोड़ेंगे</li>
</ul>
</div>
</div>
)
}


// --- utils ---
function today(){ const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'); }


function downloadCSV(csv: string, filename: string){ const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click(); URL.revokeObjectURL(link.href); }


function amountInWords(n:number){ try{ const i = Math.floor(n); const f = Math.round((n - i) * 100); const words = toWords(i) + (f?` and ${f}/100`:'' ); return words + ' only'; } catch { return `${fmt(n)} only`; } }


function toWords(n:number): string{ const a = ["","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"]; const b = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"]; const g = [""," thousand "," million "," billion "]; if(n===0) return "zero"; let str = ""; let grp = 0; while(n>0){ const chunk = n%1000; if(chunk){ const h = Math.floor(chunk/100); const tens = chunk%100; const ones = chunk%10; let part = ""; if(h) part += a[h] + " hundred "; if(tens<20) part += a[tens]; else part += b[Math.floor(tens/10)] + (ones?"-"+a[ones]:""); str = part + g[grp] + str; } n = Math.floor(n/1000); grp++; } return str.trim(); }
