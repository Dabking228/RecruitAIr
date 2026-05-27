import { AgentDrawer } from '@/components/agent/AgentDrawer'

export default function RecruiterLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {children}
      <AgentDrawer role="recruiter" />
    </>
  )
}