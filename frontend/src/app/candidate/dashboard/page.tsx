import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LogoutButton } from '@/components/LogoutButton'

export default async function CandidateDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const name = user.user_metadata?.name

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">RecruitAIr</h1>
          <p className="text-sm text-gray-500">Candidate Portal</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{name}</span>
          <LogoutButton />
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Welcome, {name?.split(' ')[0] ?? 'Candidate'}!
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          <Link href="/candidate/profile">
            <div className="bg-white border rounded-lg p-6 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer">
              <div className="text-2xl mb-2">👤</div>
              <h3 className="font-semibold">My Profile</h3>
              <p className="text-sm text-gray-500 mt-1">
                Add your name, summary, education, and professional links.
              </p>
            </div>
          </Link>

          <Link href="/candidate/documents">
            <div className="bg-white border rounded-lg p-6 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer">
              <div className="text-2xl mb-2">📄</div>
              <h3 className="font-semibold">My Documents</h3>
              <p className="text-sm text-gray-500 mt-1">
                Upload your resume, certificates, and evidence files.
              </p>
            </div>
          </Link>

          <Link href="/candidate/claims">
            <div className="bg-white border rounded-lg p-6 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer">
              <div className="text-2xl mb-2">🔍</div>
              <h3 className="font-semibold">My Claims</h3>
              <p className="text-sm text-gray-500 mt-1">
                Review what the AI extracted from your resume. Confirm accurate claims.
              </p>
            </div>
          </Link>

          <Link href="/candidate/jobs">
            <div className="bg-white border rounded-lg p-6 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer">
              <div className="text-2xl mb-2">🔍</div>
              <h3 className="font-semibold">Browse Jobs</h3>
              <p className="text-sm text-gray-500 mt-1">
                Find open positions and apply with your evidence-backed profile.
              </p>
            </div>
          </Link>

          <Link href="/candidate/applications">
            <div className="bg-white border rounded-lg p-6 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer">
              <div className="text-2xl mb-2">📋</div>
              <h3 className="font-semibold">My Applications</h3>
              <p className="text-sm text-gray-500 mt-1">
                Track the status of your submitted applications.
              </p>
            </div>
          </Link>

        </div>
      </main>
    </div>
  )
}