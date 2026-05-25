import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LogoutButton } from '@/components/LogoutButton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function RecruiterDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const firstName = user.user_metadata?.name?.split(' ')[0] || 'Recruiter'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">RecruitAIr</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            {user.user_metadata?.name || user.email}
          </span>
          <LogoutButton />
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">
          Welcome, {firstName}
        </h2>
        <p className="text-gray-500 mb-8">Recruiter Dashboard</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Company Profile</CardTitle>
              <CardDescription>
                Set up your organisation before posting jobs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/recruiter/company">
                <Button variant="outline" className="w-full">
                  Manage Company →
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Job Listings</CardTitle>
              <CardDescription>
                Create and manage your job positions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/recruiter/jobs">
                <Button variant="outline" className="w-full">
                  My Jobs →
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-gray-200 opacity-60">
            <CardHeader>
              <CardTitle className="text-base">Candidates</CardTitle>
              <CardDescription>
                Review applicants and AI reports
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" disabled>
                Coming in Phase 9 →
              </Button>
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  )
}