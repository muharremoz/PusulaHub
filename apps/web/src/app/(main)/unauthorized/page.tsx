import { Lock } from "lucide-react"

export default function UnauthorizedPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="mx-auto size-14 rounded-full bg-zinc-100 flex items-center justify-center">
          <Lock className="size-6 text-zinc-500" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Erişim yetkiniz yok</h1>
        <p className="text-[13px] text-zinc-600 leading-relaxed">
          Hub'da görüntüleyebileceğiniz hiçbir modüle yetkilendirilmemişsiniz.
          Lütfen yöneticinizle iletişime geçin.
        </p>
      </div>
    </div>
  )
}
