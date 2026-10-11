/**
 * O viewport das páginas da sala e da inscrição: ocupa o ecrã todo do iPhone (as zonas seguras tratam-se
 * com env(safe-area-inset-*)). O teclado trata-se pela área visível (visualViewport), igual no iPhone
 * e no Android: sem `interactive-widget=resizes-content`, que num telemóvel pequeno com o teclado
 * aberto deixava o ecrã mais largo do que alto e trocava a sala para o desenho deitado.
 * O ecrã é fixo, sem ampliar: o Safari ampliava a página ao tocar na caixa de mensagem e ela ficava
 * cortada dos lados depois de fechar o teclado. (Os campos têm 16 px, o mínimo que não dispara isso.)
 */
export const ROOM_VIEWPORT = {
  name: "viewport",
  content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
};
