import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * This route handles the redirect after Supabase email confirmation.
 * Supabase sends the user to /auth/callback?code=... after they
 * click the confirmation link in their email.
 *
 * Currently not used because email confirmation is OFF in development.
 * Enable it in Supabase dashboard when deploying to production.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.session) {
      const role = data.session.user.user_metadata?.role
      const destination =
        role === 'recruiter' ? '/recruiter/dashboard' : '/candidate/dashboard'
      return NextResponse.redirect(`${origin}${destination}`)
    }
  }

  // Something went wrong — redirect to login with an error hint
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}