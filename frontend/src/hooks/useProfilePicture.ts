import { useQuery } from "@tanstack/react-query"
import useUserApi from "./apiClients/useUserApi"

export const PROFILE_AVATAR_QUERY_KEY = ["profile-avatar"]

/**
 * Immagine di profilo caricata dall'utente, come data URI.
 *
 * Sta in una query separata da `["profile"]` di proposito: i byte dell'immagine
 * non devono viaggiare a ogni lettura del profilo, e dopo un upload va
 * invalidata solo questa. La chiave è condivisa fra il pulsante in sidebar e la
 * pagina profilo, così cambiare l'immagine la aggiorna in entrambi i punti.
 */
const useProfilePicture = () => {
    const { getAvatar } = useUserApi()

    return useQuery({
        queryKey: PROFILE_AVATAR_QUERY_KEY,
        queryFn: getAvatar,
        staleTime: 5 * 60 * 1000
    })
}

export default useProfilePicture
