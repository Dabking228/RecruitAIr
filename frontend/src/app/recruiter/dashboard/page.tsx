import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LogoutButton } from '@/components/LogoutButton'

export default async function RecruiterDashboard() {
  // Server component — read session from cookie on the server
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Double-check on the server (middleware already protects this route,
  // but it's good practice to verify in the page itself too)
  if (!user) redirect('/login')

  const name = user.user_metadata?.name || user.email
  const role = user.user_metadata?.role

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">RecruitAIr</h1>
          <p className="text-sm text-gray-500">Recruiter Portal</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{name}</span>
          <LogoutButton />
        </div>
      </header>

      <main className="p-8 max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Welcome back, {user.user_metadata?.name?.split(' ')[0] || 'Recruiter'}!
        </h2>
        <p className="text-gray-500 mb-6">
          Your evidence-aware recruitment dashboard
        </p>

        {/* Auth verification info — remove after testing */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-8">
          <p className="text-green-800 font-medium text-sm">
            ✅ Auth working correctly
          </p>
          <p className="text-green-700 text-xs mt-1">User ID: {user.id}</p>
          <p className="text-green-700 text-xs">Role: {role}</p>
          <p className="text-green-700 text-xs">Email: {user.email}</p>
        </div>

        <p className="text-gray-400">
          Full dashboard coming in Phase 9.
        </p>
      </main>
    </div>
  )
}