import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function Admin() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-[640px]">
        <CardHeader>
          <CardTitle>Admin Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Placeholder - admin content goes here */}
        </CardContent>
      </Card>
    </div>
  )
}
