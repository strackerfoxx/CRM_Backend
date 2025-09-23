

export async function createService(req, res) {
    const { businessId } = req.user
    const { name,  } = req.body

    try {
        await prisma.service.create({
            data: {

            }
        })
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({ msg: "Client already exists" })
        }
        return res.status(500).json(error)
    }
}