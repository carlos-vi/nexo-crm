import useApiGet from './useApiGet.js'

// Lista de vendedores (para los selectores de responsable y filtros).
export default function useUsers() {
  const { data } = useApiGet('/users')
  return data ?? []
}
