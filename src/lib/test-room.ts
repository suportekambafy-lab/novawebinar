/**
 * Quem entra pela sala de teste fica com `teste-…@sala.local`: não é público, e cada teste contava como uma
 * pessoa nova em Inscritos, Assistiram e na retenção. Filtro PostgREST para tirar essas entradas dos números
 * (os convidados do acesso fácil, `convidado-…@sala.local`, são público e contam).
 */
export const NOT_TEST_ROOM = "email.is.null,email.not.like.teste-%@sala.local";
