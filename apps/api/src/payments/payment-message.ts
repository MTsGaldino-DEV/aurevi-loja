// Buyer-facing text based on Mercado Pago's status_detail table (checkout-api-payments/response-handling).
const rejected: Record<string, string> = {
  cc_rejected_bad_filled_card_number: 'Revise o número do cartão.',
  cc_rejected_bad_filled_date: 'Revise a data de vencimento.',
  cc_rejected_bad_filled_other: 'Revise os dados do cartão.',
  cc_rejected_bad_filled_security_code: 'Revise o código de segurança do cartão.',
  cc_rejected_call_for_authorize: 'Autorize o pagamento com o banco do cartão e tente de novo.',
  cc_rejected_card_disabled:
    'Ligue para o banco para ativar seu cartão. O telefone está no verso dele.',
  cc_rejected_duplicated_payment:
    'Você já fez um pagamento com esse valor. Para pagar de novo, use outro cartão ou o Pix.',
  cc_rejected_insufficient_amount: 'O cartão não tem saldo suficiente. Use outro cartão ou o Pix.',
  cc_rejected_invalid_installments: 'O cartão não aceita esse número de parcelas. Escolha outro.',
  cc_rejected_max_attempts: 'Você atingiu o limite de tentativas. Use outro cartão ou o Pix.',
};

export function paymentMessage(status: string, detail: string | null) {
  switch (status) {
    case 'rejected':
      return (detail && rejected[detail]) ?? 'O pagamento foi recusado. Use outro cartão ou o Pix.';
    case 'in_process':
      return 'Estamos analisando seu pagamento. A resposta sai em até 2 dias úteis.';
    case 'expired':
      return 'O Pix expirou. Escolha uma forma de pagamento para gerar outro.';
    case 'failed':
      return 'Não foi possível processar o pagamento. Confira os dados e tente de novo.';
    default:
      return null;
  }
}
