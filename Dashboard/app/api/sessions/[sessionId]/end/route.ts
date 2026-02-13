import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5001';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    // Check for close_tmux query param (default true)
    const { searchParams } = new URL(request.url);
    const closeTmux = searchParams.get('close_tmux') !== 'false';

    const response = await fetch(
      `${BACKEND_URL}/api/sessions/${sessionId}/end?close_tmux=${closeTmux}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to end session:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to connect to backend' },
      { status: 500 }
    );
  }
}
