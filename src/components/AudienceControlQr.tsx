import { SessionQrBadge } from './BrandEmblem';

export function AudienceControlQr({code,onOpenHost}:{code:string;onOpenHost?:()=>void}) {
  const url=`${window.location.origin}/?mode=host&code=${encodeURIComponent(code)}`;
  return <section className="audience-control-qr" aria-label="ربط هاتف الحكم">
    <SessionQrBadge code={code} url={url} size="md"/>
    <strong>اربط هاتف الحكم</strong>
    <small>امسح الرمز وسجّل الدخول بحساب المشرف</small>
    {onOpenHost&&<button type="button" className="show-button show-button--cream" onClick={onOpenHost}>تحكم من هون</button>}
  </section>;
}
