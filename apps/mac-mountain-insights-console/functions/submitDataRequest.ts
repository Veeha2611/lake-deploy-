import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      request_title,
      question_asked,
      desired_output,
      date_range,
      source_systems,
      notes,
      data_requirements
    } = await req.json();

    const emailBody = `
Data Request Submission
=======================

FROM: ${user.full_name} (${user.email})
SUBMITTED: ${new Date().toISOString()}

REQUEST DETAILS:
----------------
Title: ${request_title}
Question Asked: ${question_asked}
Desired Output: ${desired_output}
Date Range Needed: ${date_range || 'Not specified'}

SUSPECTED SOURCE SYSTEMS:
-------------------------
${source_systems?.join(', ') || 'Not specified'}

ADDITIONAL NOTES:
-----------------
${notes || 'None'}

DATA REQUIREMENTS (Structured):
--------------------------------
${JSON.stringify(data_requirements, null, 2)}

This request was submitted via the MAC App Engine Data Request workflow.
Please review and prioritize accordingly.
    `.trim();

    try {
      await base44.integrations.Core.SendEmail({
        to: 'patch.cochran@macmtn.com',
        subject: `Data Request: ${request_title}`,
        body: emailBody
      });

      return Response.json({
        success: true,
        message: 'Data request submitted successfully'
      });

    } catch (emailError) {
      return Response.json({
        success: false,
        error: 'Failed to send email',
        reason: emailError.message
      }, { status: 500 });
    }

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});