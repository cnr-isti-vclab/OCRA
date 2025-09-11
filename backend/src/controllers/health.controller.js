/**
 * Health Controller
 * 
 * HTTP request handlers for health check endpoints
 */

/**
 * Basic health check
 */
export async function healthCheck(req, res) {
  res.json({ status: 'ok', service: 'backend' });
}
